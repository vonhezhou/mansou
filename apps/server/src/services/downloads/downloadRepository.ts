import { access } from "node:fs/promises";
import type { DownloadTask, StorageDatabase } from "@mansou/storage";

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
  failedImageKeys(id: string) {
    return this.storage.listFailedDownloadImageKeys(id);
  }
  itemsPage(id: string, offset: number, limit: number, failedOnly: boolean) {
    return this.storage.listDownloadItemsPage(id, offset, limit, failedOnly);
  }
  item(id: string, imageKey: string) {
    return this.storage.getDownloadItem(id, imageKey);
  }
  saveItem(input: Parameters<StorageDatabase["saveDownloadItem"]>[0]) {
    this.storage.saveDownloadItem(input);
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
