import { useRef, useState } from "react";
import { veneraApi } from "../api/venera.js";
import type { CacheStats, DownloadItem, DownloadTask } from "../types.js";
import type { DownloadAction } from "../features/downloads/types.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

export function useDownloads(runWith: RunWith) {
  const [downloads, setDownloadSnapshot] = useState<DownloadTask[]>([]);
  const [downloadItems, setDownloadItems] = useState<Record<string, DownloadItem[]>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [failedItemsOnly, setFailedItemsOnly] = useState(false);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [taskOperations, setTaskOperations] = useState<Record<string, string>>({});
  const [cacheOperation, setCacheOperation] = useState<string | null>(null);
  const downloadsVersion = useRef(0);
  const activeTasks = useRef(new Set<string>());
  const cacheBusy = useRef(false);

  function setDownloads(tasks: DownloadTask[]) {
    downloadsVersion.current++;
    setDownloadSnapshot(tasks);
  }

  async function loadDownloads() {
    const version = ++downloadsVersion.current;
    const tasks = await veneraApi.listDownloads();
    // 实时事件到达后，旧的列表请求不能把进度回滚到先前快照。
    if (version === downloadsVersion.current) setDownloadSnapshot(tasks);
  }

  async function loadCacheStats() {
    setCache(await veneraApi.getCacheStats());
  }

  async function withTask(taskId: string, label: string, work: () => Promise<void>) {
    if (activeTasks.current.has(taskId)) return;
    activeTasks.current.add(taskId);
    try {
      await runWith(
        (loading) =>
          setTaskOperations((current) => {
            const next = { ...current };
            if (loading) next[taskId] = label;
            else delete next[taskId];
            return next;
          }),
        work,
      );
    } finally {
      activeTasks.current.delete(taskId);
    }
  }

  async function changeCache(action: "clear" | "prune") {
    if (cacheBusy.current) return;
    cacheBusy.current = true;
    try {
      await runWith(
        (loading) => setCacheOperation(loading ? "正在清理图片缓存…" : null),
        async () => {
          setCache(await (action === "clear" ? veneraApi.clearCache() : veneraApi.pruneCache()));
        },
      );
    } finally {
      cacheBusy.current = false;
    }
  }

  async function fetchDownloadItems(taskId: string) {
    setItemErrors((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    try {
      const items = await veneraApi.listDownloadItems(taskId);
      setDownloadItems((current) => ({ ...current, [taskId]: items }));
    } catch (error) {
      setItemErrors((current) => ({
        ...current,
        [taskId]: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  }

  async function loadDownloadItems(task: DownloadTask) {
    await withTask(task.id, "正在加载下载明细…", () => fetchDownloadItems(task.id));
  }

  async function retryDownloadItem(task: DownloadTask, item: DownloadItem) {
    const imageKey = item.imageKey ?? item.image_key;
    if (!imageKey || ["queued", "running"].includes(task.status)) return;
    await withTask(task.id, "正在重试图片…", async () => {
      await veneraApi.retryDownloadItem(task.id, imageKey);
      await fetchDownloadItems(task.id);
      await loadDownloads();
    });
  }

  async function downloadAction(task: DownloadTask, action: DownloadAction) {
    if (action === "delete" || action === "delete-files") {
      const label = action === "delete-files" ? "及已下载文件" : "";
      if (!window.confirm(`删除下载任务「${task.title ?? task.comicId}」${label}？`)) return;
    }
    const labels: Record<DownloadAction, string> = {
      pause: "正在暂停任务…",
      resume: "正在继续下载…",
      cancel: "正在取消任务…",
      rerun: "正在重新创建任务…",
      "download-local": "正在请求下载文件…",
      delete: "正在删除任务…",
      "delete-files": "正在删除任务与文件…",
      "retry-failed": "正在重试失败图片…",
    };
    await withTask(task.id, labels[action], async () => {
      if (action === "pause") await veneraApi.pauseDownload(task.id);
      if (action === "resume") await veneraApi.resumeDownload(task.id);
      if (action === "cancel") await veneraApi.cancelDownload(task.id);
      if (action === "rerun") await veneraApi.rerunDownload(task.id);
      if (action === "download-local") {
        const link = document.createElement("a");
        link.href = veneraApi.downloadDownloadCbzUrl(task.id);
        link.target = "_blank";
        link.rel = "noreferrer";
        link.click();
        return;
      }
      if (action === "delete" || action === "delete-files") {
        await veneraApi.deleteDownload(task.id, action === "delete-files");
        setDownloadItems((current) => {
          const next = { ...current };
          delete next[task.id];
          return next;
        });
      }
      if (action === "retry-failed") {
        await veneraApi.retryFailedDownloadItems(task.id);
        await fetchDownloadItems(task.id);
      }
      await loadDownloads();
    });
  }

  return {
    cache,
    downloads,
    downloadItems,
    itemErrors,
    failedItemsOnly,
    taskOperations,
    cacheOperation,
    loadingDownloads: cacheOperation !== null || Object.keys(taskOperations).length > 0,
    loadCacheStats,
    loadDownloads,
    setDownloads,
    setFailedItemsOnly,
    clearCache: () => changeCache("clear"),
    pruneCache: () => changeCache("prune"),
    loadDownloadItems,
    retryDownloadItem,
    downloadAction,
  };
}
