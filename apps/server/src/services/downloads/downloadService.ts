import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
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
  private readonly deleting = new Map<string, Promise<DownloadTask>>();
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
      () =>
        this.all()
          .filter((task) => task.status === "queued" && !this.deleting.has(task.id))
          .map((task) => task.id),
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

  create(input: DownloadInput) {
    this.assertOpen();
    const episodeId = input.episodeId ?? "_default";
    if (
      this.all().some(
        (task) =>
          this.deleting.has(task.id) &&
          task.sourceKey === input.sourceKey &&
          task.comicId === input.comicId,
      )
    ) {
      throw new AppError("DOWNLOAD_BUSY", "Wait for the previous download to be deleted");
    }
    const existing = this.all().find(
      (task) =>
        !this.deleting.has(task.id) &&
        task.sourceKey === input.sourceKey &&
        task.comicId === input.comicId &&
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
    this.emitChange();
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
        this.emitChange();
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
      const cbzPath = `${directory}.cbz`;
      await zipDirectory(directory, cbzPath);
      signal.throwIfAborted();
      return { taskId: id, path: cbzPath };
    });
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
      for (const item of this.repository.items(id).filter((item) => item.status === "failed")) {
        signal.throwIfAborted();
        try {
          results.push({
            imageKey: item.image_key,
            ok: true,
            result: await this.retry(task, item.image_key, signal),
          });
        } catch (error) {
          signal.throwIfAborted();
          results.push({
            imageKey: item.image_key,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { task: this.find(id), retried: results.length, results };
    });
  }
  private async retry(task: DownloadTask, imageKey: string, signal: AbortSignal) {
    const result = await this.runner.retryImage(task, imageKey, signal);
    signal.throwIfAborted();
    const latest = this.find(task.id)!;
    this.update(task.id, {
      completed: result.downloaded
        ? Math.min(latest.total, latest.completed + 1)
        : latest.completed,
    });
    return { task: this.find(task.id), item: result.item };
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
    this.emitChange();
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
    return () => this.listeners.delete(listener);
  }
  private emitChange() {
    if (!this.listeners.size) return;
    const tasks = this.all();
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(tasks));
      } catch (error) {
        this.onError(error);
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
    this.listeners.clear();
  }
}
