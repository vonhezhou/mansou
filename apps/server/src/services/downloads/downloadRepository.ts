import { access } from "node:fs/promises";
import type { DownloadTask, StorageDatabase } from "@venera/storage";

/** SQLite is the authority; callers receive snapshots, never shared mutable tasks. */
export class DownloadRepository {
  constructor(private readonly storage: StorageDatabase) {}
  all() {
    return this.storage.listDownloads();
  }
  queuedIds() {
    return this.storage.listQueuedDownloadIds();
  }
  forComic(sourceKey: string, comicId: string) {
    return this.storage.listComicDownloads(sourceKey, comicId);
  }
  find(id: string) {
    return this.storage.getDownload(id);
  }
  save(task: DownloadTask) {
    this.storage.saveDownload(task);
  }
  delete(id: string) {
    this.storage.deleteDownload(id);
  }
  items(id: string) {
    return this.storage.listDownloadItems(id);
  }
  item(id: string, imageKey: string) {
    return this.storage.getDownloadItem(id, imageKey);
  }
  saveItem(input: Parameters<StorageDatabase["saveDownloadItem"]>[0]) {
    this.storage.saveDownloadItem(input);
  }
  async countCompletedFiles(
    taskId: string,
    imageKeys: string[],
    concurrency: number,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const files = new Map(
      this.items(taskId)
        .filter((item) => item.status === "completed" && item.file_path)
        .map((item) => [item.image_key, item.file_path!]),
    );
    const candidates = imageKeys.flatMap((key) => {
      const file = files.get(key);
      return file ? [file] : [];
    });
    let next = 0;
    let completed = 0;
    // 只核验完成记录，限制文件系统并发；全部在途核验结束后再返回或抛错。
    const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (next < candidates.length) {
        signal.throwIfAborted();
        const file = await existingFile(candidates[next++]);
        signal.throwIfAborted();
        if (file) completed++;
      }
    });
    const results = await Promise.allSettled(workers);
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
    signal.throwIfAborted();
    return completed;
  }
  async completedFile(taskId: string, imageKey: string) {
    const item = this.item(taskId, imageKey);
    if (item?.status !== "completed" || !item.file_path) return null;
    return existingFile(item.file_path);
  }
}

async function existingFile(file: string) {
  try {
    await access(file);
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
