import { NovelEngineExecutor } from "./engineExecutor.js";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { assertDownloadSupported, type BookSource, type Catalog } from "@mansou/novel-engine";
import type { components } from "@mansou/contracts";
import type { StorageDatabase } from "@mansou/storage";
import { AppError } from "../../errors.js";
import { DownloadScheduler } from "../downloads/downloadScheduler.js";
import { NovelSourceService } from "./sourceService.js";

type Task = components["schemas"]["NovelTask"];
type Input = components["schemas"]["NovelDownloadRequest"];
type TaskRecord = { task: Task; raw: BookSource };
type Plan = { catalog: Catalog; indexes: number[] };

export class NovelDownloadService {
  private readonly scheduler: DownloadScheduler;
  private readonly deleting = new Set<string>();
  constructor(
    private readonly db: StorageDatabase["novels"],
    private readonly sources: NovelSourceService,
    private readonly engine: NovelEngineExecutor,
    private readonly options: {
      outputDir: string;
      concurrency: number;
      retries: number;
    },
    private readonly onError: (error: unknown) => void,
  ) {
    this.scheduler = new DownloadScheduler(
      options.concurrency,
      () =>
        this.all()
          .filter((task) => task.status === "queued" && !this.deleting.has(task.id))
          .map((task) => task.id),
      (id, signal) => this.run(id, signal),
      onError,
    );
  }
  init() {
    for (const task of this.all())
      if (task.status === "running")
        this.patch(task.id, { status: "queued", phase: "等待恢复", error: undefined });
    this.scheduler.kick();
  }
  all(): Task[] {
    return this.db.list<TaskRecord>("task").map((row) => row.task);
  }
  private record(id: string): TaskRecord {
    const record = this.db.get<TaskRecord>("task", id);
    if (!record) throw new AppError("DOWNLOAD_NOT_FOUND", "小说下载任务不存在");
    return record;
  }
  private patch(id: string, patch: Partial<Task>) {
    const row = this.record(id);
    row.task = { ...row.task, ...patch, updatedAt: new Date().toISOString() };
    this.db.save("task", id, row);
    return row.task;
  }
  create(input: Input): Task {
    if (this.scheduler.closing) throw new AppError("APP_CLOSING", "服务正在关闭");
    const source = this.sources.source(input.sourceId);
    assertDownloadSupported(source.raw);
    const all = input.all ?? true;
    const start = all ? 1 : (input.start ?? 1),
      limit = all ? 3 : (input.limit ?? 3);
    const duplicate = this.all().find(
      (task) =>
        !this.deleting.has(task.id) &&
        task.sourceId === input.sourceId &&
        task.bookUrl === input.book.bookUrl &&
        task.all === all &&
        task.start === start &&
        task.limit === limit &&
        ["queued", "running", "paused", "completed"].includes(task.status),
    );
    if (duplicate) return duplicate;
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      sourceId: input.sourceId,
      sourceName: source.summary.name,
      name: input.book.name,
      author: input.book.author,
      bookUrl: input.book.bookUrl,
      all,
      start,
      limit,
      status: "queued",
      phase: "排队中",
      total: 0,
      completed: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.save("task", task.id, { task, raw: source.raw });
    this.scheduler.kick();
    return task;
  }
  async action(id: string, action: "pause" | "resume" | "cancel") {
    if (this.scheduler.closing) throw new AppError("APP_CLOSING", "服务正在关闭");
    if (this.deleting.has(id)) throw new AppError("DOWNLOAD_BUSY", "正在删除任务");
    const task = this.record(id).task;
    if (action === "resume") {
      if (!["paused", "failed"].includes(task.status)) return task;
      await this.scheduler.wait(id);
      if (this.deleting.has(id)) throw new AppError("DOWNLOAD_BUSY", "正在删除任务");
      // 等待在途请求结束后重新读取，不能覆盖同时到达的取消操作。
      if (!["paused", "failed"].includes(this.record(id).task.status)) return this.record(id).task;
      const result = this.patch(id, { status: "queued", phase: "等待恢复", error: undefined });
      this.scheduler.kick();
      return result;
    }
    if (action === "pause" && !["queued", "running"].includes(task.status)) return task;
    if (action === "cancel" && ["completed", "cancelled"].includes(task.status)) return task;
    this.scheduler.stop(id);
    return this.patch(id, {
      status: action === "pause" ? "paused" : "cancelled",
      phase: action === "pause" ? "已暂停" : "已取消",
      error: undefined,
    });
  }
  async delete(id: string) {
    const task = this.record(id).task;
    if (this.deleting.has(id)) throw new AppError("DOWNLOAD_BUSY", "正在删除任务");
    this.deleting.add(id);
    try {
      this.scheduler.stop(id);
      await this.scheduler.wait(id);
      await rm(this.directory(id), { recursive: true, force: true });
      this.db.transaction(() => {
        this.db.delete("task", id);
        this.db.delete("plan", id);
      });
      return task;
    } finally {
      this.deleting.delete(id);
    }
  }
  private directory(id: string) {
    return path.join(this.options.outputDir, id);
  }
  private chapterFile(id: string, index: number) {
    return path.join(this.directory(id), `${index}.txt`);
  }
  private async run(id: string, signal: AbortSignal) {
    try {
      signal.throwIfAborted();
      const row = this.record(id);
      const task = row.task;
      this.patch(id, { status: "running", phase: "读取目录", error: undefined });
      let plan = this.db.get<Plan>("plan", id);
      if (!plan) {
        const catalog = await this.engine.execute<Catalog>(
          "catalog",
          [row.raw, task.bookUrl],
          signal,
          task.sourceId,
        );
        signal.throwIfAborted();
        if (!catalog.tocComplete)
          throw new Error("目录未遍历完，拒绝创建不完整下载；请检查分页规则或目录页数");
        const indexes = catalog.chapters
          .map((_, index) => index)
          .slice(task.start - 1, task.all ? undefined : task.start - 1 + task.limit);
        if (!indexes.length) throw new Error("所选章节范围超出目录");
        plan = { catalog, indexes };
        this.db.save("plan", id, plan);
      }
      const directory = this.directory(id);
      await mkdir(directory, { recursive: true });
      signal.throwIfAborted();
      this.patch(id, { total: plan.indexes.length, completed: 0, phase: "下载章节" });
      let completed = 0;
      for (const index of plan.indexes) {
        signal.throwIfAborted();
        const chapter = plan.catalog.chapters[index];
        this.patch(id, { current: chapter.title });
        const file = this.chapterFile(id, index);
        let existing = false;
        try {
          existing = (await stat(file)).size > 0;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (!existing) {
          let body: string | undefined;
          for (let attempt = 0; attempt < this.options.retries; attempt++) {
            try {
              body = await this.engine.execute<string>(
                "chapter",
                [row.raw, chapter, plan.catalog],
                signal,
                task.sourceId,
              );
              break;
            } catch (error) {
              signal.throwIfAborted();
              if (attempt + 1 === this.options.retries) throw error;
              await delay(1000 * 2 ** attempt, undefined, { signal });
            }
          }
          signal.throwIfAborted();
          const staged = `${file}.tmp`;
          await writeFile(staged, body!, "utf8");
          signal.throwIfAborted();
          await rename(staged, file);
        }
        signal.throwIfAborted();
        this.patch(id, { completed: ++completed });
      }
      this.patch(id, { phase: "生成 TXT", current: undefined });
      await this.export(id, plan, signal);
      signal.throwIfAborted();
      this.patch(id, { status: "completed", phase: "已完成" });
    } catch (error) {
      if (!signal.aborted)
        this.patch(id, {
          status: "failed",
          phase: "下载失败",
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
  private async export(id: string, plan: Plan, signal: AbortSignal) {
    const task = this.record(id).task;
    const file = path.join(this.directory(id), "book.txt");
    const staged = `${file}.tmp`;
    const handle = await open(staged, "w");
    try {
      await handle.writeFile(`${task.name}\n${task.author ? `作者：${task.author}\n` : ""}\n`);
      let bytes = 0;
      for (const index of plan.indexes) {
        signal.throwIfAborted();
        const body = await readFile(this.chapterFile(id, index), "utf8");
        bytes += Buffer.byteLength(body);
        if (bytes > 200 * 1024 * 1024) throw new Error("小说正文超过 200 MiB，停止导出");
        await handle.writeFile(`${plan.catalog.chapters[index].title}\n\n${body}\n\n`);
      }
    } finally {
      await handle.close();
    }
    signal.throwIfAborted();
    await rename(staged, file);
  }
  async openTxt(id: string) {
    const task = this.record(id).task;
    if (task.status !== "completed")
      throw new AppError("DOWNLOAD_NOT_COMPLETED", "选定章节尚未全部下载成功");
    const file = path.join(this.directory(id), "book.txt");
    await stat(file);
    return { name: `${task.name}.txt`, stream: createReadStream(file) };
  }
  close() {
    return this.scheduler.close().catch(this.onError);
  }
}
