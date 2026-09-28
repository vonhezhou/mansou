import { api, apiBase } from "./client.js";
import type {
  AggregatedSearchItem,
  CacheStats,
  Details,
  DownloadItem,
  DownloadTask,
  Health,
  HistoryItem,
  RepositorySource,
  RetryFailedDownloadImagesResult,
  SearchResult,
  SettingsResponse,
  Source,
  SourceMetadata,
} from "../types.js";

function comicDetailPath(sourceKey: string, comicId: string) {
  return `/comics/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}`;
}

function episodePagesPath(sourceKey: string, comicId: string, episodeId: string) {
  return `/comics/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}/episodes/${encodeURIComponent(episodeId)}/pages`;
}

export function imageUrl(
  sourceKey: string,
  imageKey: string,
  comicId?: string,
  episodeId?: string,
  thumbnail = false,
) {
  const params = new URLSearchParams({ sourceKey, imageKey, thumbnail: String(thumbnail) });
  if (comicId) params.set("comicId", comicId);
  if (episodeId) params.set("episodeId", episodeId);
  return `${apiBase}/image?${params}`;
}

export function downloadsEventUrl() {
  return `${apiBase}/downloads/events`;
}

export const veneraApi = {
  health: () => api<Health>("/health"),
  listInstalledSources: () => api<Source[]>("/sources/installed"),
  listSourceMetadata: () => api<SourceMetadata[]>("/sources/metadata"),
  listAvailableSources: () => api<RepositorySource[]>("/sources/available"),
  installSource: (source: string) =>
    api("/sources/install", { method: "POST", body: JSON.stringify({ source }) }),
  refreshRepository: () =>
    api<{ sources: RepositorySource[] }>("/source-repository/refresh", { method: "POST" }),
  reloadSources: () => api("/sources/reload", { method: "POST" }),
  setSourceEnabled: (sourceKey: string, enabled: boolean) =>
    api(`/sources/${encodeURIComponent(sourceKey)}/enabled`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  getSourceSettings: (sourceKey: string) =>
    api<SettingsResponse>(`/sources/${encodeURIComponent(sourceKey)}/settings`),
  updateSourceSettings: (sourceKey: string, values: Record<string, unknown>) =>
    api(`/sources/${encodeURIComponent(sourceKey)}/settings`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    }),
  clearSourceSettings: (sourceKey: string) =>
    api<SettingsResponse>(`/sources/${encodeURIComponent(sourceKey)}/settings`, {
      method: "DELETE",
    }),
  importCookies: (sourceKey: string, url: string, cookies: string[]) =>
    api(`/sources/${encodeURIComponent(sourceKey)}/cookies`, {
      method: "PUT",
      body: JSON.stringify({ url, cookies }),
    }),
  clearCookies: (sourceKey: string) =>
    api(`/sources/${encodeURIComponent(sourceKey)}/cookies`, { method: "DELETE" }),
  search: (
    sourceKey: string,
    keyword: string,
    cursor?: { page?: number; next?: string | null },
  ) => {
    const params = new URLSearchParams({ keyword });
    if (cursor?.next) params.set("next", cursor.next);
    else params.set("page", String(cursor?.page ?? 1));
    return api<SearchResult>(`/search/${encodeURIComponent(sourceKey)}?${params}`);
  },
  aggregatedSearch: (keyword: string, sources?: string[]) => {
    const params = new URLSearchParams({ keyword });
    if (sources?.length) params.set("sources", sources.join(","));
    return api<AggregatedSearchItem[]>(`/search?${params}`);
  },
  comicDetails: (sourceKey: string, comicId: string) =>
    api<Details>(comicDetailPath(sourceKey, comicId)),
  episodePages: (sourceKey: string, comicId: string, episodeId: string) =>
    api<{ images: string[] }>(episodePagesPath(sourceKey, comicId, episodeId)),
  listHistory: () => api<HistoryItem[]>("/library/history"),
  saveHistory: (
    sourceKey: string,
    comicId: string,
    input: { episodeId?: string; page?: number; progress?: number },
  ) =>
    api(`/library/history/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createDownload: (input: {
    sourceKey: string;
    comicId: string;
    episodeId?: string;
    all?: boolean;
  }) => api<DownloadTask>("/downloads", { method: "POST", body: JSON.stringify(input) }),
  listDownloads: () => api<DownloadTask[]>("/downloads"),
  listDownloadItems: (taskId: string) =>
    api<DownloadItem[]>(`/downloads/${encodeURIComponent(taskId)}/items`),
  retryDownloadItem: (taskId: string, imageKey: string) =>
    api(`/downloads/${encodeURIComponent(taskId)}/items/retry`, {
      method: "POST",
      body: JSON.stringify({ imageKey }),
    }),
  retryFailedDownloadItems: (taskId: string) =>
    api<RetryFailedDownloadImagesResult>(
      `/downloads/${encodeURIComponent(taskId)}/items/retry-failed`,
      { method: "POST" },
    ),
  pauseDownload: (taskId: string) =>
    api<DownloadTask>(`/downloads/${encodeURIComponent(taskId)}/pause`, { method: "POST" }),
  resumeDownload: (taskId: string) =>
    api<DownloadTask>(`/downloads/${encodeURIComponent(taskId)}/resume`, { method: "POST" }),
  cancelDownload: (taskId: string) =>
    api(`/downloads/${encodeURIComponent(taskId)}/cancel`, { method: "POST" }),
  rerunDownload: (taskId: string) =>
    api(`/downloads/${encodeURIComponent(taskId)}/rerun`, { method: "POST" }),
  exportDownloadCbz: (taskId: string) =>
    api<{ path: string }>(`/downloads/${encodeURIComponent(taskId)}/cbz`, { method: "POST" }),
  downloadDownloadCbzUrl: (taskId: string) =>
    `${apiBase}/downloads/${encodeURIComponent(taskId)}/cbz`,
  deleteDownload: (taskId: string, files = false) =>
    api(`/downloads/${encodeURIComponent(taskId)}${files ? "?files=true" : ""}`, {
      method: "DELETE",
    }),
  getCacheStats: () => api<CacheStats>("/settings/cache"),
  pruneCache: () => api<CacheStats>("/settings/cache/images/prune", { method: "POST" }),
  clearCache: () => api<CacheStats>("/settings/cache/images", { method: "DELETE" }),
};
