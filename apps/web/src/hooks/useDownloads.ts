import { useRef, useState } from "react";
import { veneraApi } from "../api/venera.js";
import type { CacheStats, DownloadItem, DownloadItemsPage, DownloadTask } from "../types.js";
import type { DownloadAction } from "../features/downloads/types.js";
import { createDownloadSnapshotStore } from "../lib/downloadSnapshot.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

export function useDownloads(runWith: RunWith) {
  // 高频快照由下载视图和计数各自订阅，避免推动整个 Workspace 重新渲染。
  const [snapshotStore] = useState(createDownloadSnapshotStore);
  const [downloadItems, setDownloadItems] = useState<Record<string, DownloadItemsPage>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [failedItemsOnly, setFailedItemsOnlyState] = useState(false);
  const failedOnlyRef = useRef(false);
  const itemVersions = useRef(new Map<string, number>());
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [taskMessages, setTaskMessages] = useState<Record<string, string>>({});
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  const [taskOperations, setTaskOperations] = useState<Record<string, string>>({});
  const [cacheOperation, setCacheOperation] = useState<string | null>(null);
  const downloadsVersion = useRef(0);
  const activeTasks = useRef(new Set<string>());
  const cacheBusy = useRef(false);

  function setDownloads(tasks: DownloadTask[]) {
    downloadsVersion.current++;
    snapshotStore.setSnapshot(tasks);
  }

  async function loadDownloads() {
    const version = ++downloadsVersion.current;
    const tasks = await veneraApi.listDownloads();
    // 实时事件到达后，旧的列表请求不能把进度回滚到先前快照。
    if (version === downloadsVersion.current) snapshotStore.setSnapshot(tasks);
  }

  async function loadCacheStats() {
    setCache(await veneraApi.getCacheStats());
  }

  async function withTask(taskId: string, label: string, work: () => Promise<void>) {
    if (activeTasks.current.has(taskId)) return;
    activeTasks.current.add(taskId);
    setTaskErrors((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setTaskMessages((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    try {
      await runWith(
        (loading) =>
          setTaskOperations((current) => {
            const next = { ...current };
            if (loading) next[taskId] = label;
            else delete next[taskId];
            return next;
          }),
        async () => {
          try {
            await work();
          } catch (error) {
            setTaskErrors((current) => ({
              ...current,
              [taskId]: error instanceof Error ? error.message : String(error),
            }));
          }
        },
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

  function setFailedItemsOnly(value: boolean) {
    failedOnlyRef.current = value;
    setFailedItemsOnlyState(value);
    setDownloadItems({});
    setItemErrors({});
  }

  async function fetchDownloadItems(taskId: string, offset = 0) {
    const failedOnly = failedOnlyRef.current;
    const version = (itemVersions.current.get(taskId) ?? 0) + 1;
    itemVersions.current.set(taskId, version);
    const currentRequest = () =>
      version === itemVersions.current.get(taskId) && failedOnly === failedOnlyRef.current;
    setItemErrors((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    try {
      let page = await veneraApi.listDownloadItemsPage(taskId, { offset, limit: 100, failedOnly });
      if (!currentRequest()) return;
      // 重试或删除后末页可能消失，仅补取一次新的末页。
      if (page.total > 0 && page.offset >= page.total) {
        page = await veneraApi.listDownloadItemsPage(taskId, {
          offset: Math.floor((page.total - 1) / page.limit) * page.limit,
          limit: page.limit,
          failedOnly,
        });
      }
      if (currentRequest()) setDownloadItems((current) => ({ ...current, [taskId]: page }));
    } catch (error) {
      if (!currentRequest()) return;
      setItemErrors((current) => ({
        ...current,
        [taskId]: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  }

  async function loadDownloadItems(task: DownloadTask, offset = 0) {
    await withTask(task.id, "正在加载下载明细…", () => fetchDownloadItems(task.id, offset));
  }

  async function retryDownloadItem(task: DownloadTask, item: DownloadItem) {
    const imageKey = item.imageKey ?? item.image_key;
    if (!imageKey || ["queued", "running"].includes(task.status)) return;
    await withTask(task.id, "正在重试图片…", async () => {
      await veneraApi.retryDownloadItem(task.id, imageKey);
      await fetchDownloadItems(task.id, downloadItems[task.id]?.offset ?? 0);
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
      "download-local": "正在准备 CBZ 文件，较大的漫画需要一些时间…",
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
        await veneraApi.exportDownloadCbz(task.id);
        const link = document.createElement("a");
        link.href = veneraApi.downloadDownloadCbzUrl(task.id);
        link.download = "";
        link.rel = "noreferrer";
        link.click();
        setTaskMessages((current) => ({
          ...current,
          [task.id]: "文件已准备，已请求浏览器开始下载。",
        }));
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
        await fetchDownloadItems(task.id, downloadItems[task.id]?.offset ?? 0);
      }
      await loadDownloads();
    });
  }

  return {
    cache,
    snapshotStore,
    downloadItems,
    itemErrors,
    failedItemsOnly,
    taskOperations,
    taskMessages,
    taskErrors,
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
