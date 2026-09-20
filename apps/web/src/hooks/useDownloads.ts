import { useState } from "react";
import { veneraApi } from "../api/venera.js";
import type { CacheStats, DownloadItem, DownloadTask } from "../types.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

export function useDownloads(runWith: RunWith) {
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [downloadItems, setDownloadItems] = useState<Record<string, DownloadItem[]>>({});
  const [failedItemsOnly, setFailedItemsOnly] = useState(false);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [loadingDownloads, setLoadingDownloads] = useState(false);

  async function loadDownloads() {
    setDownloads(await veneraApi.listDownloads());
  }

  async function loadCacheStats() {
    setCache(await veneraApi.getCacheStats());
  }

  async function clearCache() {
    await runWith(setLoadingDownloads, async () => setCache(await veneraApi.clearCache()));
  }

  async function pruneCache() {
    await runWith(setLoadingDownloads, async () => setCache(await veneraApi.pruneCache()));
  }

  async function loadDownloadItems(task: DownloadTask) {
    await runWith(setLoadingDownloads, async () => {
      const items = await veneraApi.listDownloadItems(task.id);
      setDownloadItems((current) => ({ ...current, [task.id]: items }));
    });
  }

  async function retryDownloadItem(task: DownloadTask, item: DownloadItem) {
    const imageKey = item.imageKey ?? item.image_key;
    if (!imageKey) return;
    await runWith(setLoadingDownloads, async () => {
      await veneraApi.retryDownloadItem(task.id, imageKey);
      await loadDownloadItems(task);
      await loadDownloads();
    });
  }

  async function downloadAction(
    task: DownloadTask,
    action: "cancel" | "rerun" | "download-local" | "delete" | "delete-files",
  ) {
    await runWith(setLoadingDownloads, async () => {
      if (action === "cancel") await veneraApi.cancelDownload(task.id);
      if (action === "rerun") await veneraApi.rerunDownload(task.id);
      if (action === "download-local") {
        const link = document.createElement("a");
        link.href = veneraApi.downloadDownloadCbzUrl(task.id);
        link.target = "_blank";
        link.rel = "noreferrer";
        link.click();
      }
      if (action === "delete") {
        if (!window.confirm(`删除下载任务「${task.title ?? task.comicId}」？`)) return;
        await veneraApi.deleteDownload(task.id);
      }
      if (action === "delete-files") {
        if (!window.confirm(`删除下载任务「${task.title ?? task.comicId}」及已下载文件？`)) return;
        await veneraApi.deleteDownload(task.id, true);
      }
      await loadDownloads();
    });
  }

  return {
    cache,
    downloads,
    downloadItems,
    failedItemsOnly,
    loadingDownloads,
    loadCacheStats,
    loadDownloads,
    setDownloads,
    setFailedItemsOnly,
    clearCache,
    pruneCache,
    loadDownloadItems,
    retryDownloadItem,
    downloadAction,
  };
}
