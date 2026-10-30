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
  async completedFile(taskId: string, imageKey: string) {
    const item = this.item(taskId, imageKey);
    if (item?.status !== "completed" || !item.file_path) return null;
    try {
      await access(item.file_path);
      return item.file_path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
