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
  prefetchChapter?: boolean;
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
    progress(
      { phase: "loading_details", total: 0, completed: 0, totalKnown: false },
      "Loading comic details",
    );
    const plan = await this.plan(task, signal);
    progress({
      title: plan.title,
      outputDir: plan.outputDir,
      episodeId: plan.all ? "__all__" : plan.episodes[0].id,
    });
    type Chapter = (typeof plan.episodes)[number] & { images: string[] };
    const prepare = async (episode: (typeof plan.episodes)[number]): Promise<Chapter> => {
      signal.throwIfAborted();
      const pages = await this.sources.get(task.sourceKey).comicPages(task.comicId, episode.id);
      signal.throwIfAborted();
      return { ...episode, images: pages.images };
    };
    // 预取失败先转为结果，消费该章节时再抛出，避免图片下载期间出现未处理拒绝。
    const prefetch = (episode: (typeof plan.episodes)[number]) =>
      prepare(episode).then(
        (value): PromiseSettledResult<Chapter> => ({ status: "fulfilled", value }),
        (reason): PromiseSettledResult<Chapter> => ({ status: "rejected", reason }),
      );
    let pending: Promise<PromiseSettledResult<Chapter>> | undefined;
    let total = 0;
    let completed = 0;
    try {
      for (let index = 0; index < plan.episodes.length; index++) {
        signal.throwIfAborted();
        const episode = plan.episodes[index];
        progress(
          { phase: "loading_pages", current: episode.id },
          `Loading pages for ${episode.id}`,
        );
        const prepared = await (pending ?? prefetch(episode));
        pending = undefined;
        signal.throwIfAborted();
        if (prepared.status === "rejected") throw prepared.reason;
        const chapter = prepared.value;
        total += chapter.images.length;
        progress({ total, completed, totalKnown: index === plan.episodes.length - 1 });
        await ensureDir(chapter.directory);
        signal.throwIfAborted();
        // 只向前预取一章，最多一个章节请求；全局源并发为 1 时关闭预取。
        if (this.options.prefetchChapter !== false && index + 1 < plan.episodes.length)
          pending = prefetch(plan.episodes[index + 1]);
        progress(
          { phase: "downloading_images" },
          `Downloading ${chapter.images.length} images for ${chapter.id}`,
        );
        try {
          await this.downloadImages(
            task,
            chapter,
            signal,
            (imageKey) => progress({ current: imageKey }),
            (downloaded) => {
              completed++;
              // 已有文件也计入进度，但不为恢复扫描的每张已有图片单独写库。
              if (downloaded) progress({ completed });
            },
          );
        } finally {
          if (!signal.aborted) progress({ completed });
        }
      }
    } finally {
      // 插件调用不能强制取消，删除或关闭前必须等待唯一的在途预取结束。
      await pending;
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
    type Episode = Awaited<ReturnType<DownloadRunner["plan"]>>["episodes"][number];
    const positions = new Map<string, { episode: Episode; index: number }>();
    let nextEpisode = 0;
    // 同一批次串行重试；只扩展尚未解析的章节，失败时留在原章节供下一张图片重新请求。
    return async (imageKey: string) => {
      signal.throwIfAborted();
      const completed = await this.repository.completedFile(task.id, imageKey);
      signal.throwIfAborted();
      if (completed) return { item: this.repository.item(task.id, imageKey)!, downloaded: false };
      plan ??= this.plan(task, signal).catch((error) => {
        plan = undefined;
        throw error;
      });
      const { episodes } = await plan;
      signal.throwIfAborted();
      let position = positions.get(imageKey);
      while (!position && nextEpisode < episodes.length) {
        signal.throwIfAborted();
        const episode = episodes[nextEpisode];
        const { images } = await this.sources
          .get(task.sourceKey)
          .comicPages(task.comicId, episode.id);
        signal.throwIfAborted();
        images.forEach((key, index) => {
          // 跨章节和章节内的重复键均保留首次位置，维持原有文件命名语义。
          if (!positions.has(key)) positions.set(key, { episode, index });
        });
        nextEpisode++;
        position = positions.get(imageKey);
      }
      if (!position) throw new Error(`Image not found in task episodes: ${imageKey}`);
      const { episode, index } = position;
      await ensureDir(episode.directory);
      await this.downloadImage(task, imageKey, episode.id, episode.directory, index, signal);
      return { item: this.repository.item(task.id, imageKey)!, downloaded: true };
    };
  }

  private async downloadImages(
    task: DownloadTask,
    chapter: { id: string; directory: string; images: string[] },
    signal: AbortSignal,
    current: (imageKey: string) => void,
    completed: (downloaded: boolean) => void,
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
            if (file) {
              completed(false);
              continue;
            }
            current(imageKey);
            await this.downloadImage(task, imageKey, chapter.id, chapter.directory, index, signal);
            completed(true);
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
    let image: Awaited<ReturnType<ImageProxyService["loadBytes"]>> | undefined;
    for (let attempt = 1; attempt <= this.options.retries; attempt++) {
      signal.throwIfAborted();
      try {
        image ??= await this.images.loadBytes(
          { sourceKey: task.sourceKey, comicId: task.comicId, episodeId, imageKey },
          "read-only",
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
