import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { SourceRegistry } from "@venera/core";
import type { DownloadTask } from "@venera/storage";
import type { ImageProxyService } from "../imageProxy.js";
import { DownloadRepository } from "./downloadRepository.js";
import { writeImage } from "./downloadFiles.js";
import { ensureDir, safeFilename, writeJson } from "../../utils/fs.js";

export type DownloadOptions = {
  outputDir: string;
  concurrency: number;
  retries: number;
};
export type DownloadProgress = (patch: Partial<DownloadTask>, log?: string) => void;

export class DownloadRunner {
  constructor(
    private readonly sources: SourceRegistry,
    private readonly images: Pick<ImageProxyService, "loadBytes">,
    private readonly repository: DownloadRepository,
    private readonly options: DownloadOptions,
  ) {}

  private async plan(task: DownloadTask, signal: AbortSignal) {
    signal.throwIfAborted();
    const details = await this.sources.get(task.sourceKey).comicDetails(task.comicId);
    signal.throwIfAborted();
    const title = details.title || task.comicId;
    const chapters = details.chapters ?? {};
    const all = task.all || task.episodeId === "__all__";
    const available = Object.keys(chapters);
    const episodeIds = all
      ? available.length
        ? available
        : ["_default"]
      : [task.episodeId === "_default" ? (available[0] ?? "_default") : task.episodeId];
    const comicDir = path.join(
      this.options.outputDir,
      safeFilename(task.sourceKey),
      safeFilename(`${title}_${task.comicId}`),
    );
    const episodes = episodeIds.map((id) => ({
      id,
      directory: path.join(comicDir, safeFilename(chapters[id] ?? id)),
    }));
    return { title, all, episodes, outputDir: all ? comicDir : episodes[0].directory };
  }

  async run(task: DownloadTask, signal: AbortSignal, progress: DownloadProgress) {
    progress({ phase: "loading_details" }, "Loading comic details");
    const plan = await this.plan(task, signal);
    progress({
      title: plan.title,
      outputDir: plan.outputDir,
      episodeId: plan.all ? "__all__" : plan.episodes[0].id,
    });
    const chapters = [];
    for (const episode of plan.episodes) {
      signal.throwIfAborted();
      progress({ phase: "loading_pages", current: episode.id }, `Loading pages for ${episode.id}`);
      const pages = await this.sources.get(task.sourceKey).comicPages(task.comicId, episode.id);
      signal.throwIfAborted();
      chapters.push({ ...episode, images: pages.images });
    }
    let completed = 0;
    const total = chapters.reduce((sum, chapter) => sum + chapter.images.length, 0);
    for (const chapter of chapters) {
      for (const image of chapter.images) {
        if (await this.repository.completedFile(task.id, image)) completed++;
        signal.throwIfAborted();
      }
    }
    progress({ total, completed });
    for (const chapter of chapters) {
      signal.throwIfAborted();
      await ensureDir(chapter.directory);
      signal.throwIfAborted();
      progress(
        { phase: "downloading_images" },
        `Downloading ${chapter.images.length} images for ${chapter.id}`,
      );
      await this.downloadImages(
        task,
        chapter,
        signal,
        (imageKey) => progress({ current: imageKey }),
        () => progress({ completed: ++completed }),
      );
    }
    signal.throwIfAborted();
    progress({ phase: "writing_metadata", current: undefined }, "Writing metadata");
    await writeJson(path.join(plan.outputDir, "metadata.json"), {
      sourceKey: task.sourceKey,
      comicId: task.comicId,
      episodeIds: plan.episodes.map((episode) => episode.id),
      title: plan.title,
      all: task.all,
    });
    signal.throwIfAborted();
  }

  async retryImage(task: DownloadTask, imageKey: string, signal: AbortSignal) {
    return this.createImageRetry(task, signal)(imageKey);
  }

  createImageRetry(task: DownloadTask, signal: AbortSignal) {
    let plan: ReturnType<DownloadRunner["plan"]> | undefined;
    const chapters = new Map<string, Promise<Map<string, number>>>();
    // 仅在一次批量重试内复用解析结果，不跨操作缓存源数据；失败结果允许重新请求。
    return async (imageKey: string) => {
      signal.throwIfAborted();
      const completed = await this.repository.completedFile(task.id, imageKey);
      signal.throwIfAborted();
      if (completed) return { item: this.repository.item(task.id, imageKey)!, downloaded: false };
      plan ??= this.plan(task, signal).catch((error) => {
        plan = undefined;
        throw error;
      });
      for (const episode of (await plan).episodes) {
        signal.throwIfAborted();
        let pages = chapters.get(episode.id);
        if (!pages) {
          pages = this.sources
            .get(task.sourceKey)
            .comicPages(task.comicId, episode.id)
            .then(({ images }) => {
              const indices = new Map<string, number>();
              images.forEach((key, index) => {
                if (!indices.has(key)) indices.set(key, index);
              });
              return indices;
            })
            .catch((error) => {
              chapters.delete(episode.id);
              throw error;
            });
          chapters.set(episode.id, pages);
        }
        const index = (await pages).get(imageKey);
        signal.throwIfAborted();
        if (index === undefined) continue;
        await ensureDir(episode.directory);
        await this.downloadImage(task, imageKey, episode.id, episode.directory, index, signal);
        return { item: this.repository.item(task.id, imageKey)!, downloaded: true };
      }
      throw new Error(`Image not found in task episodes: ${imageKey}`);
    };
  }

  private async downloadImages(
    task: DownloadTask,
    chapter: { id: string; directory: string; images: string[] },
    signal: AbortSignal,
    current: (imageKey: string) => void,
    completed: () => void,
  ) {
    let next = 0;
    let failed = false;
    let firstError: unknown;
    const workers = Array.from(
      { length: Math.min(this.options.concurrency, chapter.images.length) },
      async () => {
        try {
          while (!failed) {
            signal.throwIfAborted();
            const index = next++;
            if (index >= chapter.images.length) return;
            const imageKey = chapter.images[index];
            const file = await this.repository.completedFile(task.id, imageKey);
            signal.throwIfAborted();
            if (file) continue;
            current(imageKey);
            await this.downloadImage(task, imageKey, chapter.id, chapter.directory, index, signal);
            completed();
          }
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      },
    );
    await Promise.all(workers);
    if (failed) throw firstError;
  }

  private async downloadImage(
    task: DownloadTask,
    imageKey: string,
    episodeId: string,
    directory: string,
    index: number,
    signal: AbortSignal,
  ) {
    for (let attempt = 1; attempt <= this.options.retries; attempt++) {
      signal.throwIfAborted();
      try {
        const image = await this.images.loadBytes(
          { sourceKey: task.sourceKey, comicId: task.comicId, episodeId, imageKey },
          true,
        );
        signal.throwIfAborted();
        const filePath = await writeImage(directory, index, imageKey, image);
        signal.throwIfAborted();
        this.repository.saveItem({ taskId: task.id, imageKey, filePath, status: "completed" });
        return;
      } catch (error) {
        signal.throwIfAborted();
        const classified = classifyDownloadError(error);
        this.repository.saveItem({
          taskId: task.id,
          imageKey,
          status: "failed",
          retryCount: attempt,
          error: classified.message,
          errorCode: classified.code,
        });
        if (attempt === this.options.retries) throw error;
        await delay(Math.min(30000, 1000 * 2 ** (attempt - 1)), undefined, { signal });
      }
    }
  }
}

export function classifyDownloadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/);
  if (statusMatch) return { code: `HTTP_${statusMatch[1]}`, message };
  if (/timeout|timed out|abort/i.test(message)) return { code: "TIMEOUT", message };
  if (/cancelled/i.test(message)) return { code: "CANCELLED", message };
  if (/too large/i.test(message)) return { code: "IMAGE_TOO_LARGE", message };
  return { code: "DOWNLOAD_ERROR", message };
}
