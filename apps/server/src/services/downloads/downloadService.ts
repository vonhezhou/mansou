import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm, stat, rename } from "node:fs/promises";
import type { DownloadTask } from "@venera/storage";
import { AppError } from "../../errors.js";
import { zipDirectory } from "./archive.js";
import { DownloadRepository } from "./downloadRepository.js";
import { DownloadRunner, classifyDownloadError } from "./downloadRunner.js";
import { DownloadScheduler } from "./downloadScheduler.js";
export type { DownloadTask } from "@venera/storage";

type DownloadInput = { sourceKey: string; comicId: string; episodeId?: string; all?: boolean };
const terminal = new Set(["completed", "failed", "cancelled"]);

export class DownloadService {
  private readonly scheduler: DownloadScheduler;
  private readonly listeners = new Set<(tasks: DownloadTask[]) => void>();
  private readonly serializedListeners = new Set<(snapshot: string) => void>();
  private changeTimer?: ReturnType<typeof setTimeout>;
  private readonly deleting = new Map<string, Promise<DownloadTask>>();
  private readonly archives = new Map<string, { version: string; path: string }>();
  private readonly archiveRevisions = new Map<string, number>();
  private initialized = false;
  private closing?: Promise<void>;
  constructor(
    private readonly repository: DownloadRepository,
    private readonly runner: DownloadRunner,
    concurrency: number,
    private readonly onError: (error: unknown) => void,
  ) {
    this.scheduler = new DownloadScheduler(
      concurrency,
      () => this.repository.queuedIds().filter((id) => !this.deleting.has(id)),
      (id, signal) => this.run(id, signal),
      onError,
    );
  }

  async init() {
    if (this.initialized) return;
    this.assertOpen();
    for (const task of this.all()) {
      const resume = task.status === "running" || task.status === "queued";
      this.repository.save({ ...task, logs: task.logs ?? [], phase: task.phase ?? task.status });
      if (resume)
        this.update(
          task.id,
          {
            status: "queued",
            phase: "queued",
            error: undefined,
            errorCode: undefined,
            recovered: true,
            current: undefined,
          },
          "Task recovered after service restart",
        );
    }
    this.initialized = true;
    this.scheduler.kick();
  }
  all() {
    return this.repository.all();
  }
  find(id: string) {
    return this.repository.find(id);
  }
  items(id: string) {
    return this.find(id) ? this.repository.items(id) : null;
  }

  itemsPage(id: string, offset: number, limit: number, failedOnly: boolean) {
    return this.find(id) ? this.repository.itemsPage(id, offset, limit, failedOnly) : null;
  }

  create(input: DownloadInput) {
    this.assertOpen();
    const episodeId = input.episodeId ?? "_default";
    const tasks = this.repository.forComic(input.sourceKey, input.comicId);
    if (tasks.some((task) => this.deleting.has(task.id))) {
      throw new AppError("DOWNLOAD_BUSY", "Wait for the previous download to be deleted");
    }
    const existing = tasks.find(
      (task) =>
        !this.deleting.has(task.id) &&
        Boolean(task.all) === Boolean(input.all) &&
        (input.all || task.episodeId === episodeId || task.episodeId === "__all__") &&
        ["queued", "running", "paused", "completed"].includes(task.status),
    );
    if (existing) return existing;
    const now = new Date().toISOString();
    const task: DownloadTask = {
      id: randomUUID(),
      sourceKey: input.sourceKey,
      comicId: input.comicId,
      all: input.all,
      episodeId,
      status: "queued",
      phase: "queued",
      total: 0,
      completed: 0,
      logs: [],
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(task);
    this.emitChange(true);
    if (this.initialized) this.scheduler.kick();
    return task;
  }
  rerun(id: string) {
    const task = this.editable(id);
    return task ? this.create(task) : null;
  }
  pause(id: string) {
    const task = this.editable(id);
    if (!task || !["queued", "running"].includes(task.status)) return task;
    this.scheduler.stop(id);
    return this.update(
      id,
      {
        status: "paused",
        phase: "paused",
        current: undefined,
        error: undefined,
        errorCode: undefined,
      },
      "Task paused by user",
    );
  }
  cancel(id: string) {
    const task = this.editable(id);
    if (!task || terminal.has(task.status)) return task;
    this.scheduler.stop(id);
    return this.update(
      id,
      {
        status: "cancelled",
        phase: "cancelled",
        current: undefined,
        error: "Cancelled by user",
        errorCode: "CANCELLED",
      },
      "Task cancelled by user",
    );
  }
  resume(id: string) {
    const task = this.editable(id);
    if (!task || !["paused", "failed"].includes(task.status)) return task;
    this.scheduler.stop(id);
    const updated = this.update(
      id,
      {
        status: "queued",
        phase: "queued",
        current: undefined,
        error: undefined,
        errorCode: undefined,
      },
      "Task resumed by user",
    );
    if (this.initialized) this.scheduler.kick();
    return updated;
  }
  async delete(id: string, deleteFiles = false) {
    this.assertOpen();
    const pending = this.deleting.get(id);
    if (pending) return pending;
    const task = this.find(id);
    if (!task) return null;
    // Mark before yielding: no new execution may use this task while deletion waits.
    const deleting = Promise.resolve()
      .then(async () => {
        this.scheduler.stop(id);
        await this.scheduler.wait(id);
        if (deleteFiles && task.outputDir) {
          await rm(task.outputDir, { recursive: true, force: true });
          await rm(`${task.outputDir}.cbz`, { force: true });
        }
        const deleted = this.find(id) ?? task;
        this.repository.delete(id);
        this.archives.delete(id);
        this.archiveRevisions.delete(id);
        this.emitChange(true);
        return deleted;
      })
      .finally(() => {
        this.deleting.delete(id);
        this.scheduler.kick();
      });
    this.deleting.set(id, deleting);
    this.scheduler.stop(id);
    if (!terminal.has(task.status))
      this.update(id, { status: "cancelled", phase: "cancelled", current: undefined });
    return deleting;
  }
  async exportCbz(id: string) {
    const task = this.editable(id);
    if (!task) return null;
    if (task.status !== "completed" || !task.outputDir)
      throw new AppError("DOWNLOAD_NOT_COMPLETED", "Only completed download tasks can be exported");
    const directory = task.outputDir;
    return this.scheduler.execute(id, async (signal) => {
      signal.throwIfAborted();
      const version = this.archiveVersion(directory);
      const cached = this.archives.get(id);
      if (cached?.version === version) {
        try {
          await stat(cached.path);
          signal.throwIfAborted();
          return { taskId: id, path: cached.path };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      this.archives.delete(id);
      const cbzPath = `${directory}.cbz`;
      const temporary = `${cbzPath}.${randomUUID()}.tmp`;
      try {
        await zipDirectory(directory, temporary);
        signal.throwIfAborted();
        await rename(temporary, cbzPath);
        if (this.archiveVersion(directory) === version)
          this.archives.set(id, { version, path: cbzPath });
        return { taskId: id, path: cbzPath };
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }
  private archiveVersion(directory: string) {
    const contains = (parent: string, child: string) => {
      const relative = path.relative(parent, child);
      return (
        !relative ||
        (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
      );
    };
    // 全本与单章任务可能共享目录，任一相关任务更新都使归档失效。
    return JSON.stringify(
      this.all()
        .filter(
          (task) =>
            task.outputDir &&
            (contains(directory, task.outputDir) || contains(task.outputDir, directory)),
        )
        .map((task) => [task.id, task.updatedAt, this.archiveRevisions.get(task.id) ?? 0]),
    );
  }

  async openCbz(id: string) {
    const result = await this.exportCbz(id);
    return result ? { ...result, stream: createReadStream(result.path) } : null;
  }
  async retryImage(id: string, imageKey: string) {
    const task = this.retryable(id);
    if (!task) return null;
    return this.scheduler.execute(id, (signal) => this.retry(task, imageKey, signal));
  }
  async retryFailedImages(id: string) {
    const task = this.retryable(id);
    if (!task) return null;
    return this.scheduler.execute(id, async (signal) => {
      const results = [];
      const retryImage = this.runner.createImageRetry(task, signal);
      for (const imageKey of this.repository.failedImageKeys(id)) {
        signal.throwIfAborted();
        try {
          const result = await this.retry(task, imageKey, signal, retryImage);
          results.push({
            imageKey,
            ok: true,
            item: result.item,
          });
        } catch (error) {
          signal.throwIfAborted();
          results.push({
            imageKey,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { task: this.find(id), retried: results.length, results };
    });
  }
  private async retry(
    task: DownloadTask,
    imageKey: string,
    signal: AbortSignal,
    retryImage = (key: string) => this.runner.retryImage(task, key, signal),
  ) {
    const result = await retryImage(imageKey);
    signal.throwIfAborted();
    const latest = this.find(task.id)!;
    const updated = this.update(task.id, {
      completed: result.downloaded
        ? Math.min(latest.total, latest.completed + 1)
        : latest.completed,
    });
    return { task: updated, item: result.item };
  }
  private retryable(id: string) {
    const task = this.editable(id);
    if (task && (task.status === "queued" || task.status === "running"))
      throw new AppError("DOWNLOAD_BUSY", "Pause the task before retrying individual images");
    return task;
  }
  private async run(id: string, signal: AbortSignal) {
    const task = this.find(id);
    if (!task || task.status !== "queued" || signal.aborted || this.deleting.has(id)) return;
    const progress = (patch: Partial<DownloadTask>, log?: string) => {
      signal.throwIfAborted();
      if (this.deleting.has(id)) return;
      this.update(id, patch, log);
    };
    try {
      progress({ status: "running" });
      await this.runner.run(task, signal, progress);
      progress({ status: "completed", phase: "completed", current: undefined }, "Task completed");
    } catch (error) {
      // The command that aborted this execution already persisted its desired state.
      if (signal.aborted || this.deleting.has(id)) return;
      const classified = classifyDownloadError(error);
      this.update(
        id,
        {
          status: "failed",
          phase: "failed",
          current: undefined,
          error: classified.message,
          errorCode: classified.code,
        },
        `${classified.code}: ${classified.message}`,
      );
    }
  }
  private update(id: string, patch: Partial<DownloadTask>, log?: string) {
    const previous = this.find(id);
    if (!previous) return null;
    const task = { ...previous, ...patch, updatedAt: new Date().toISOString() };
    if (log)
      task.logs = [...task.logs, { time: task.updatedAt, phase: task.phase, message: log }].slice(
        -100,
      );
    this.repository.save(task);
    this.archiveRevisions.set(id, (this.archiveRevisions.get(id) ?? 0) + 1);
    this.emitChange(patch.status !== undefined);
    return task;
  }
  subscribe(listener: (tasks: DownloadTask[]) => void) {
    this.listeners.add(listener);
    try {
      listener(this.all());
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.hasListeners()) this.clearChangeTimer();
    };
  }
  subscribeSerialized(listener: (snapshot: string) => void) {
    this.serializedListeners.add(listener);
    try {
      listener(JSON.stringify(this.all()));
    } catch (error) {
      this.serializedListeners.delete(listener);
      throw error;
    }
    return () => {
      this.serializedListeners.delete(listener);
      if (!this.hasListeners()) this.clearChangeTimer();
    };
  }
  private hasListeners() {
    return this.listeners.size > 0 || this.serializedListeners.size > 0;
  }
  private clearChangeTimer() {
    clearTimeout(this.changeTimer);
    this.changeTimer = undefined;
  }
  private emitChange(immediate = false) {
    if (immediate) {
      this.clearChangeTimer();
      this.publishChange();
    } else if (this.hasListeners() && !this.changeTimer) {
      // 进度仍立即落库，只合并广播；状态切换会立即发布并清除待发进度。
      this.changeTimer = setTimeout(() => {
        this.changeTimer = undefined;
        try {
          this.publishChange();
        } catch (error) {
          this.onError(error);
        }
      }, 100);
      this.changeTimer.unref();
    }
  }
  private publishChange() {
    if (!this.hasListeners()) return;
    const tasks = this.all();
    // SSE 订阅者共享不可变字符串，避免每个连接重复克隆及序列化完整任务列表。
    const serialized = this.serializedListeners.size ? JSON.stringify(tasks) : undefined;
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(tasks));
      } catch (error) {
        this.onError(error);
      }
    }
    if (serialized !== undefined) {
      for (const listener of this.serializedListeners) {
        try {
          listener(serialized);
        } catch (error) {
          this.onError(error);
        }
      }
    }
  }
  private assertOpen() {
    if (this.scheduler.closing) throw new AppError("APP_CLOSING", "Service is closing");
  }
  private editable(id: string) {
    this.assertOpen();
    if (this.deleting.has(id)) throw new AppError("DOWNLOAD_BUSY", "Download is being deleted");
    return this.find(id);
  }
  close() {
    return (this.closing ??= this.shutdown());
  }
  private async shutdown() {
    const closing = this.scheduler.close();
    // Running tasks are queued for restart; explicit pauses/cancellations stay as-is.
    for (const task of this.all()) {
      if (task.status === "running")
        this.update(task.id, { status: "queued", phase: "queued", current: undefined });
    }
    await closing;
    await Promise.allSettled(this.deleting.values());
    this.clearChangeTimer();
    this.listeners.clear();
    this.serializedListeners.clear();
  }
}
