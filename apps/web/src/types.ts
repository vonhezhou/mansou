import type { Comic } from "@venera/contracts";

export type Source = {
  key: string;
  name: string;
  version?: string;
  hasSearch?: boolean;
  hasComic?: boolean;
};
export type RepositorySource = {
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
export type RetryFailedDownloadImagesResult = {
  task: DownloadTask | null;
  retried: number;
  results: Array<{ imageKey: string; ok: boolean; result?: unknown; error?: string }>;
};
export type CacheStats = { files: number; bytes: number };
export type SettingsResponse = import("@venera/contracts").components["schemas"]["SourceSettings"];
export type SourceAuth = import("@venera/contracts").components["schemas"]["SourceAuth"];
export type SourceLogin = import("@venera/contracts").components["schemas"]["SourceLogin"];
export type SourceMetadata = {
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
