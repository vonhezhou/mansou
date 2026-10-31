import type { Comic } from "@mansou/contracts";

export type Source = {
  subscriptionName?: string;
  subscriptionId?: string;
  key: string;
  name: string;
  version?: string;
  hasSearch?: boolean;
  hasComic?: boolean;
  hasSearchRecommendations?: boolean;
};
export type RepositorySource = {
  subscriptionId?: string;
  subscriptionName?: string;
  originalKey?: string;
  installId?: string;
  key?: string;
  name: string;
  version?: string;
  description?: string;
  fileName?: string;
  filename?: string;
};
export type SearchResult = { comics: Comic[]; maxPage?: number; next?: string | null };
export type AggregatedSearchItem = {
  sourceKey: string;
  sourceName: string;
  cancelled?: boolean;
  result?: SearchResult;
  error?: string;
};
export type Details = Comic & {
  comicId?: string;
  chapters?: Record<string, string>;
  thumbnails?: string[];
};
export type DownloadTask = {
  id: string;
  title?: string;
  sourceKey: string;
  comicId: string;
  episodeId?: string;
  all?: boolean;
  status: string;
  phase: string;
  total: number;
  totalKnown?: boolean;
  completed: number;
  error?: string;
  errorCode?: string;
  recovered?: boolean;
  outputDir?: string;
  createdAt?: string;
  updatedAt?: string;
  logs?: Array<{ time: string; phase: string; message: string }>;
};
export type DownloadItem = {
  image_key?: string;
  imageKey?: string;
  status: string;
  file_path?: string;
  retry_count?: number;
  error?: string;
  error_code?: string;
};
export type DownloadItemsPage = Omit<
  import("@mansou/contracts").components["schemas"]["DownloadItemsPage"],
  "items"
> & { items: DownloadItem[] };
export type RetryFailedDownloadImagesResult = Omit<
  import("@mansou/contracts").components["schemas"]["RetryFailedDownloadImagesResult"],
  "task"
> & { task: DownloadTask | null };
export type CacheStats = { files: number; bytes: number };
export type SourceSettingsActionResult =
  import("@mansou/contracts").components["schemas"]["SourceSettingsActionResult"];
export type SourceUiEvent = import("@mansou/contracts").components["schemas"]["SourceUiEvent"];
export type SettingsResponse = import("@mansou/contracts").components["schemas"]["SourceSettings"];
export type SourceAuth = import("@mansou/contracts").components["schemas"]["SourceAuth"];
export type SourceLogin = import("@mansou/contracts").components["schemas"]["SourceLogin"];
export type SourceMetadata = {
  favorite?: boolean;
  subscriptionId?: string;
  subscriptionName?: string;
  originalKey?: string;
  health?: import("@mansou/contracts").components["schemas"]["SourceHealth"];
  canUninstall?: boolean;
  availableVersion?: string;
  key: string;
  name: string;
  version?: string;
  enabled: number | boolean;
  script_url?: string;
  updated_at?: string;
};
export type Health = {
  ok: boolean;
  name: string;
  dataDir?: string;
  proxy?: string | null;
  noProxy?: string[];
};
