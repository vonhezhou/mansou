import type { CacheStats, DownloadItem, DownloadItemsPage, DownloadTask } from "../../types.js";

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
  taskMessages?: Record<string, string>;
  itemErrors?: Record<string, string>;
  cacheOperation?: string | null;
  cache: CacheStats | null;
  downloads: DownloadTask[];
  downloadItems: Record<string, DownloadItemsPage>;
  failedItemsOnly: boolean;
  onFailedItemsOnlyChange: (value: boolean) => void;
  onPruneCache: () => void;
  onClearCache: () => void;
  onLoadDownloadItems: (task: DownloadTask, offset?: number) => void;
  onDownloadAction: (task: DownloadTask, action: DownloadAction) => void;
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};
