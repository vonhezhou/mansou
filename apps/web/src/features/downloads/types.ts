import type { CacheStats, DownloadItem, DownloadTask } from "../../types.js";

export type DownloadAction = "cancel" | "rerun" | "cbz" | "delete" | "delete-files";

export type DownloadsViewProps = {
  busy: boolean;
  cache: CacheStats | null;
  downloads: DownloadTask[];
  downloadItems: Record<string, DownloadItem[]>;
  failedItemsOnly: boolean;
  onFailedItemsOnlyChange: (value: boolean) => void;
  onPruneCache: () => void;
  onClearCache: () => void;
  onLoadDownloadItems: (task: DownloadTask) => void;
  onDownloadAction: (task: DownloadTask, action: DownloadAction) => void;
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};
