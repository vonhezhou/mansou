import type { DownloadItem, DownloadTask } from "../types.js";

export type DownloadGroup = { key: string; title: string; tasks: DownloadTask[] };

export function getDownloadProgress(task: DownloadTask) {
  return task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
}

export function filterDownloadItems(items: DownloadItem[] | undefined, failedOnly: boolean) {
  if (!failedOnly) return items;
  return items?.filter((item) => item.status === "failed" || Boolean(item.error));
}

export function getDownloadImageKey(item: DownloadItem) {
  return item.imageKey ?? item.image_key ?? "";
}

export function groupDownloads(downloads: DownloadTask[]): DownloadGroup[] {
  return [
    {
      key: "active",
      title: "进行中",
      tasks: downloads.filter((task) => ["queued", "running"].includes(task.status)),
    },
    {
      key: "failed",
      title: "失败",
      tasks: downloads.filter((task) => task.status === "failed" || Boolean(task.error)),
    },
    {
      key: "done",
      title: "完成",
      tasks: downloads.filter((task) => task.status === "done" || task.status === "completed"),
    },
    {
      key: "other",
      title: "其他",
      tasks: downloads.filter(
        (task) =>
          !["queued", "running", "failed", "done", "completed"].includes(task.status) &&
          !task.error,
      ),
    },
  ].filter((group) => group.tasks.length > 0);
}
