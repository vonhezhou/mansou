import path from "node:path";
import { access, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { StorageDatabase } from "@venera/storage";
import { paths } from "../../storage/paths.js";
import type { SourceRegistry } from "@venera/core";
import { zipDirectory } from "./archive.js";
import { writeImage } from "./downloadFiles.js";
import { ImageProxyService } from "../imageProxy.js";
import { ensureDir, readJson, safeFilename, writeJson } from "../../utils/fs.js";
import { config } from "../../config/config.js";

type DownloadStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
type DownloadPhase =
  | "queued"
  | "loading_details"
  | "loading_pages"
  | "downloading_images"
  | "writing_metadata"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type DownloadTask = {
  id: string;
  sourceKey: string;
  comicId: string;
  episodeId: string;
  all?: boolean;
  title?: string;
  status: DownloadStatus;
  phase: DownloadPhase;
  total: number;
  completed: number;
  error?: string;
  errorCode?: string;
  recovered?: boolean;
  current?: string;
  logs: Array<{ time: string; phase: DownloadPhase; message: string }>;
  outputDir?: string;
  createdAt: string;
  updatedAt: string;
};

export class DownloadService {
  private readonly tasks = new Map<string, DownloadTask>();
  private readonly cancelledTasks = new Set<string>();
  private readonly activeTasks = new Set<string>();
  private readonly listeners = new Set<(tasks: DownloadTask[]) => void>();

  constructor(
    private readonly sources: SourceRegistry,
    private readonly imageProxy: ImageProxyService,
    private readonly storage?: StorageDatabase,
  ) {}

  async init() {
    const tasks =
      (this.storage?.listDownloads() as DownloadTask[] | undefined) ??
      (await readJson<DownloadTask[]>(paths.downloadTasks, []));
    for (const task of tasks) {
      const shouldResume = task.status === "running" || task.status === "queued";
      this.tasks.set(task.id, {
        ...task,
        status: shouldResume ? "queued" : task.status,
        phase: shouldResume ? "queued" : (task.phase ?? task.status),
        logs: shouldResume
          ? [
              ...(task.logs ?? []),
              {
                time: new Date().toISOString(),
                phase: "queued",
                message: "Task recovered after service restart",
              },
            ]
          : (task.logs ?? []),
        error: shouldResume ? undefined : task.error,
        errorCode: shouldResume ? undefined : task.errorCode,
        recovered: shouldResume ? true : task.recovered,
        current: shouldResume ? undefined : task.current,
      });
    }
    await this.saveTasks();
    this.reloadTasksFromStorage();
    this.processQueue();
  }

  create(input: { sourceKey: string; comicId: string; episodeId?: string; all?: boolean }) {
    const episodeId = input.episodeId ?? "_default";
    const existing = this.all().find(
      (task) =>
        task.sourceKey === input.sourceKey &&
        task.comicId === input.comicId &&
        Boolean(task.all) === Boolean(input.all) &&
        (input.all || task.episodeId === episodeId || task.episodeId === "__all__") &&
        (task.status === "queued" ||
          task.status === "running" ||
          task.status === "paused" ||
          task.status === "completed"),
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const task: DownloadTask = {
      id: randomUUID(),
      sourceKey: input.sourceKey,
      comicId: input.comicId,
      episodeId,
      all: input.all,
      status: "queued",
      phase: "queued",
      total: 0,
      completed: 0,
      logs: [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    this.saveTask(task);
    this.reloadTasksFromStorage();
    this.emitChange();
    this.processQueue();
    return task;
  }

  subscribe(listener: (tasks: DownloadTask[]) => void) {
    this.listeners.add(listener);
    listener(this.all());
    return () => this.listeners.delete(listener);
  }

  rerun(id: string) {
    const oldTask = this.tasks.get(id);
    if (!oldTask) return null;
    return this.create({
      sourceKey: oldTask.sourceKey,
      comicId: oldTask.comicId,
      episodeId: oldTask.episodeId,
      all: oldTask.all,
    });
  }

  cancel(id: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return task;
    }
    this.cancelledTasks.add(id);
    this.update(task, {
      status: "cancelled",
      phase: "cancelled",
      error: "Cancelled by user",
      current: undefined,
    });
    this.addLog(task, "cancelled", "Task cancelled by user");
    this.reloadTasksFromStorage();
    this.emitChange();
    this.processQueue();
    return task;
  }

  pause(id: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== "queued" && task.status !== "running") return task;
    this.cancelledTasks.add(id);
    this.update(task, {
      status: "paused",
      phase: "paused",
      error: undefined,
      errorCode: undefined,
      current: undefined,
    });
    this.addLog(task, "paused", "Task paused by user");
    this.reloadTasksFromStorage();
    this.emitChange();
    this.processQueue();
    return task;
  }

  resume(id: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== "paused" && task.status !== "failed") return task;
    this.cancelledTasks.delete(id);
    this.update(task, {
      status: "queued",
      phase: "queued",
      error: undefined,
      errorCode: undefined,
      current: undefined,
    });
    this.addLog(task, "queued", "Task resumed by user");
    this.reloadTasksFromStorage();
    this.emitChange();
    this.processQueue();
    return task;
  }

  async exportCbz(id: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== "completed" || !task.outputDir) {
      throw new Error("Only completed download tasks can be exported");
    }
    const cbzPath = `${task.outputDir}.cbz`;
    await zipDirectory(task.outputDir, cbzPath);
    return { taskId: task.id, path: cbzPath };
  }

  async openCbz(id: string) {
    const result = await this.exportCbz(id);
    if (!result) return null;
    return { ...result, stream: createReadStream(result.path) };
  }

  async delete(id: string, deleteFiles = false) {
    const task = this.tasks.get(id);
    if (!task) return null;
    this.cancel(id);
    this.tasks.delete(id);
    this.storage?.deleteDownloadItems(id);
    this.storage?.deleteDownload(id);
    this.cancelledTasks.delete(id);
    this.activeTasks.delete(id);
    if (!this.storage) await this.saveTasks();
    this.reloadTasksFromStorage();
    this.emitChange();
    if (deleteFiles && task.outputDir) {
      await rm(task.outputDir, { recursive: true, force: true });
      await rm(`${task.outputDir}.cbz`, { force: true });
    }
    this.processQueue();
    return task;
  }

  async retryFailedImages(id: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    const failedItems = (
      (this.storage?.listDownloadItems(id) as
        | Array<{ image_key?: string; imageKey?: string; status?: string }>
        | undefined) ?? []
    ).filter((item) => item.status === "failed");
    const results = [];
    for (const item of failedItems) {
      const imageKey = item.image_key ?? item.imageKey;
      if (!imageKey) continue;
      try {
        results.push({ imageKey, ok: true, result: await this.retryImage(id, imageKey) });
      } catch (error) {
        results.push({
          imageKey,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.reloadTasksFromStorage();
    this.emitChange();
    return { task: this.find(id), retried: results.length, results };
  }

  async retryImage(id: string, imageKey: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    const completedFile = await this.completedFilePath(task.id, imageKey);
    if (completedFile) {
      this.storage?.saveDownloadItem({
        taskId: task.id,
        imageKey,
        filePath: completedFile,
        status: "completed",
      });
      return {
        task,
        item: this.storage?.getDownloadItem(task.id, imageKey) ?? {
          task_id: task.id,
          image_key: imageKey,
          file_path: completedFile,
          status: "completed",
        },
      };
    }

    const details = await this.sources.get(task.sourceKey).comicDetails(task.comicId);
    const title = details.title || task.comicId;
    const chapters = details.chapters as Record<string, string> | undefined;
    const episodeIds =
      task.all || task.episodeId === "__all__"
        ? Object.keys(chapters ?? { _default: "默认章节" })
        : [
            task.episodeId === "_default"
              ? (Object.keys(chapters ?? {})[0] ?? "_default")
              : task.episodeId,
          ];
    const comicDir = path.join(
      paths.downloads,
      safeFilename(task.sourceKey),
      safeFilename(`${title}_${task.comicId}`),
    );
    const baseOutputDir =
      task.all || task.episodeId === "__all__"
        ? comicDir
        : path.join(comicDir, safeFilename(chapters?.[episodeIds[0]] ?? episodeIds[0]));

    for (const episodeId of episodeIds) {
      const pages = await this.sources.get(task.sourceKey).comicPages(task.comicId, episodeId);
      const index = pages.images.indexOf(imageKey);
      if (index < 0) continue;
      const chapterDir =
        task.all || task.episodeId === "__all__"
          ? path.join(comicDir, safeFilename(chapters?.[episodeId] ?? episodeId))
          : baseOutputDir;
      await ensureDir(chapterDir);
      this.addLog(task, "downloading_images", `Retrying image ${imageKey}`);
      const filePath = await this.downloadImageWithRetry(
        task,
        imageKey,
        episodeId,
        chapterDir,
        index,
      );
      this.storage?.saveDownloadItem({ taskId: task.id, imageKey, filePath, status: "completed" });
      if (task.completed < task.total) this.update(task, { completed: task.completed + 1 });
      return {
        task,
        item: this.storage?.getDownloadItem(task.id, imageKey) ?? {
          task_id: task.id,
          image_key: imageKey,
          file_path: filePath,
          status: "completed",
        },
      };
    }

    throw new Error(`Image not found in task episodes: ${imageKey}`);
  }

  private processQueue() {
    const limit = Math.max(1, config.downloadTaskConcurrency);
    while (this.activeTasks.size < limit) {
      const task = this.all().find(
        (item) => item.status === "queued" && !this.activeTasks.has(item.id),
      );
      if (!task) return;
      this.activeTasks.add(task.id);
      void this.run(task.id).finally(() => {
        this.activeTasks.delete(task.id);
        this.processQueue();
      });
    }
  }

  all() {
    this.reloadTasksFromStorage();
    return [...this.tasks.values()];
  }

  find(id: string) {
    this.reloadTasksFromStorage();
    return this.tasks.get(id) ?? null;
  }

  private async run(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    try {
      this.update(task, { status: "running" });
      this.update(task, { phase: "loading_details" });
      this.addLog(task, "loading_details", "Loading comic details");
      this.throwIfCancelled(task);
      const details = await this.sources.get(task.sourceKey).comicDetails(task.comicId);
      this.throwIfCancelled(task);
      const title = details.title || task.comicId;
      const chapters = details.chapters as Record<string, string> | undefined;
      const comicDir = path.join(
        paths.downloads,
        safeFilename(task.sourceKey),
        safeFilename(`${title}_${task.comicId}`),
      );
      const episodeIds = task.all
        ? Object.keys(chapters ?? { _default: "默认章节" })
        : [
            task.episodeId === "_default"
              ? (Object.keys(chapters ?? {})[0] ?? "_default")
              : task.episodeId,
          ];
      const outputDir = task.all
        ? comicDir
        : path.join(comicDir, safeFilename(chapters?.[episodeIds[0]] ?? episodeIds[0]));
      await ensureDir(outputDir);

      const chapterPages = [];
      for (const episodeId of episodeIds) {
        this.update(task, { phase: "loading_pages", current: episodeId });
        this.addLog(task, "loading_pages", `Loading pages for ${episodeId}`);
        chapterPages.push({
          episodeId,
          pages: await this.sources.get(task.sourceKey).comicPages(task.comicId, episodeId),
        });
      }
      const total = chapterPages.reduce((sum, item) => sum + item.pages.images.length, 0);
      const completed = await this.completedImageCount(
        task.id,
        chapterPages.flatMap((item) => item.pages.images),
      );
      this.throwIfCancelled(task);
      this.update(task, {
        title,
        episodeId: task.all ? "__all__" : episodeIds[0],
        total,
        completed,
        outputDir,
      });

      for (const item of chapterPages) {
        const chapterTitle = chapters?.[item.episodeId] ?? item.episodeId;
        const chapterDir = task.all ? path.join(comicDir, safeFilename(chapterTitle)) : outputDir;
        await ensureDir(chapterDir);
        this.update(task, { phase: "downloading_images" });
        this.addLog(
          task,
          "downloading_images",
          `Downloading ${item.pages.images.length} images for ${item.episodeId}`,
        );
        await this.downloadImages(task, item.pages.images, item.episodeId, chapterDir);
      }

      this.update(task, { phase: "writing_metadata", current: undefined });
      this.addLog(task, "writing_metadata", "Writing metadata");
      await writeJson(path.join(outputDir, "metadata.json"), {
        sourceKey: task.sourceKey,
        comicId: task.comicId,
        episodeIds,
        title,
        all: task.all,
      });
      if (!this.cancelledTasks.has(task.id)) {
        this.update(task, { status: "completed", phase: "completed" });
        this.addLog(task, "completed", "Task completed");
      }
    } catch (error) {
      if (this.cancelledTasks.has(task.id)) {
        if (task.status === "paused") {
          this.update(task, { status: "paused", phase: "paused", current: undefined });
          this.addLog(task, "paused", "Task paused by user");
        } else {
          this.update(task, {
            status: "cancelled",
            phase: "cancelled",
            error: "Cancelled by user",
            errorCode: "CANCELLED",
            current: undefined,
          });
          this.addLog(task, "cancelled", "Task cancelled by user");
        }
        this.cancelledTasks.delete(task.id);
        this.reloadTasksFromStorage();
        return;
      }
      const classified = classifyDownloadError(error);
      this.update(task, {
        status: "failed",
        phase: "failed",
        error: classified.message,
        errorCode: classified.code,
      });
      this.addLog(task, "failed", `${classified.code}: ${classified.message}`);
    } finally {
      this.reloadTasksFromStorage();
    }
  }

  private update(task: DownloadTask, patch: Partial<DownloadTask>) {
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    this.saveTask(task);
  }

  private addLog(task: DownloadTask, phase: DownloadPhase, message: string) {
    task.logs.push({ time: new Date().toISOString(), phase, message });
    if (task.logs.length > 100) task.logs.splice(0, task.logs.length - 100);
    this.saveTask(task);
  }

  private saveTask(task: DownloadTask) {
    if (this.storage) {
      this.storage.saveDownload(task as unknown as Record<string, unknown>);
      this.emitChange();
      return;
    }
    void this.saveTasks();
  }

  private reloadTasksFromStorage() {
    if (!this.storage) return;
    const tasks = this.storage.listDownloads() as DownloadTask[];
    this.tasks.clear();
    for (const task of tasks) this.tasks.set(task.id, task);
  }

  private emitChange() {
    if (this.listeners.size === 0) return;
    const tasks = [...this.tasks.values()];
    for (const listener of this.listeners) listener(tasks);
  }

  private async downloadImages(
    task: DownloadTask,
    images: string[],
    episodeId: string,
    outputDir: string,
  ) {
    let nextIndex = 0;
    let firstError: unknown;
    const workerCount = Math.max(1, Math.min(config.downloadConcurrency, images.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        if (firstError) return;
        const index = nextIndex;
        nextIndex += 1;
        if (index >= images.length) return;
        this.throwIfCancelled(task);
        const imageKey = images[index];
        const completedFile = await this.completedFilePath(task.id, imageKey);
        if (completedFile) {
          this.storage?.saveDownloadItem({
            taskId: task.id,
            imageKey,
            filePath: completedFile,
            status: "completed",
          });
          continue;
        }
        this.update(task, { current: imageKey });
        try {
          const filePath = await this.downloadImageWithRetry(
            task,
            imageKey,
            episodeId,
            outputDir,
            index,
          );
          this.storage?.saveDownloadItem({
            taskId: task.id,
            imageKey,
            filePath,
            status: "completed",
          });
          this.throwIfCancelled(task);
          this.update(task, { completed: task.completed + 1 });
        } catch (error) {
          firstError = error;
          throw error;
        }
      }
    });
    await Promise.allSettled(workers);
    if (firstError) throw firstError;
    this.update(task, { current: undefined });
  }

  private async downloadImageWithRetry(
    task: DownloadTask,
    imageKey: string,
    episodeId: string,
    outputDir: string,
    index: number,
  ) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= Math.max(1, config.downloadRetries); attempt += 1) {
      try {
        this.throwIfCancelled(task);
        const image = await this.imageProxy.loadBytes(
          { sourceKey: task.sourceKey, comicId: task.comicId, episodeId, imageKey },
          true,
        );
        return await writeImage(outputDir, index, imageKey, image);
      } catch (error) {
        lastError = error;
        const classified = classifyDownloadError(error);
        this.storage?.saveDownloadItem({
          taskId: task.id,
          imageKey,
          status: "failed",
          retryCount: attempt,
          error: classified.message,
          errorCode: classified.code,
        });
        if (attempt < Math.max(1, config.downloadRetries)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        }
      }
    }
    throw lastError;
  }

  private async completedFilePath(taskId: string, imageKey: string) {
    const item = this.storage?.getDownloadItem(taskId, imageKey) as
      | { status?: string; file_path?: string }
      | null
      | undefined;
    if (item?.status !== "completed" || !item.file_path) return null;
    try {
      await access(item.file_path);
      return item.file_path;
    } catch {
      return null;
    }
  }

  private async completedImageCount(taskId: string, imageKeys: string[]) {
    let completed = 0;
    for (const imageKey of imageKeys) {
      if (await this.completedFilePath(taskId, imageKey)) completed += 1;
    }
    return completed;
  }

  private async saveTasks() {
    if (this.storage) {
      this.storage.saveDownloads(this.all() as unknown as Array<Record<string, unknown>>);
      return;
    }
    await writeJson(paths.downloadTasks, this.all());
  }

  private throwIfCancelled(task: DownloadTask) {
    if (this.cancelledTasks.has(task.id) || task.status === "cancelled") {
      throw new Error("Download task cancelled");
    }
  }
}

function retryDelayMs(attempt: number) {
  return Math.min(30000, 1000 * 2 ** (attempt - 1));
}

function classifyDownloadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/);
  if (statusMatch) return { code: `HTTP_${statusMatch[1]}`, message };
  if (/timeout|timed out|abort/i.test(message)) return { code: "TIMEOUT", message };
  if (/cancelled/i.test(message)) return { code: "CANCELLED", message };
  if (/too large/i.test(message)) return { code: "IMAGE_TOO_LARGE", message };
  return { code: "DOWNLOAD_ERROR", message };
}
