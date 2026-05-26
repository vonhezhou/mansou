import type { Comic } from "@venera/contracts";

export type Source = { key: string; name: string; version?: string; hasSearch?: boolean; hasComic?: boolean };
export type RepositorySource = { key?: string; name: string; version?: string; description?: string; fileName?: string; filename?: string };
export type SearchResult = { comics: Comic[]; maxPage?: number; next?: string | null };
export type AggregatedSearchItem = { sourceKey: string; sourceName: string; result?: SearchResult; error?: string };
export type Details = Comic & { comicId?: string; chapters?: Record<string, string>; thumbnails?: string[] };
export type DownloadTask = { id: string; title?: string; sourceKey: string; comicId: string; status: string; phase: string; total: number; completed: number; error?: string; logs?: Array<{ time: string; phase: string; message: string }> };
export type DownloadItem = { image_key?: string; imageKey?: string; status: string; file_path?: string; retry_count?: number; error?: string; error_code?: string };
export type CacheStats = { files: number; bytes: number };
export type SettingsResponse = { schema: Record<string, { default?: unknown }>; values: Record<string, unknown> };
export type SourceMetadata = { key: string; name: string; version?: string; enabled: number | boolean; script_url?: string; updated_at?: string };
export type HistoryItem = { source_key?: string; sourceKey?: string; comic_id?: string; comicId?: string; episode_id?: string; episodeId?: string; page?: number; progress?: number; updated_at?: string };
export type Health = { ok: boolean; name: string; dataDir?: string; proxy?: string | null; noProxy?: string[] };
