import type { CacheStats, DownloadItem, DownloadTask } from "../../types.js";

export type DownloadAction =
  | "pause"
  | "resume"
  | "cancel"
  | "rerun"
  | "download-local"
  | "delete"
  | "delete-files"
  | "retry-failed";

export type DownloadsViewProps = {
  busy: boolean;
  taskOperations?: Record<string, string>;
  itemErrors?: Record<string, string>;
  cacheOperation?: string | null;
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
