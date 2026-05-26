import { api, apiBase, withAccessToken } from "./client.js";
import type { CacheStats, Details, DownloadItem, DownloadTask, HistoryItem, RepositorySource, SearchResult, SettingsResponse, Source, SourceMetadata } from "../types.js";

function comicDetailPath(sourceKey: string, comicId: string) {
  return `/comics/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}`;
}

function episodePagesPath(sourceKey: string, comicId: string, episodeId: string) {
  return `/comics/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}/episodes/${encodeURIComponent(episodeId)}/pages`;
}

export function imageUrl(sourceKey: string, imageKey: string, comicId?: string, episodeId?: string, thumbnail = false) {
  const params = new URLSearchParams({ sourceKey, imageKey, thumbnail: String(thumbnail) });
  if (comicId) params.set("comicId", comicId);
  if (episodeId) params.set("episodeId", episodeId);
  return withAccessToken(`${apiBase}/image?${params}`);
}

export function downloadsEventUrl() {
  return withAccessToken(`${apiBase}/downloads/events`);
}

export const veneraApi = {
  listInstalledSources: () => api<Source[]>("/sources/installed"),
  listSourceMetadata: () => api<SourceMetadata[]>("/sources/metadata"),
  listAvailableSources: () => api<RepositorySource[]>("/sources/available"),
  installSource: (source: string) => api("/sources/install", { method: "POST", body: JSON.stringify({ source }) }),
  refreshRepository: () => api<{ sources: RepositorySource[] }>("/source-repository/refresh", { method: "POST" }),
  reloadSources: () => api("/sources/reload", { method: "POST" }),
  setSourceEnabled: (sourceKey: string, enabled: boolean) => api(`/sources/${encodeURIComponent(sourceKey)}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  getSourceSettings: (sourceKey: string) => api<SettingsResponse>(`/sources/${encodeURIComponent(sourceKey)}/settings`),
  updateSourceSettings: (sourceKey: string, values: Record<string, unknown>) => api(`/sources/${encodeURIComponent(sourceKey)}/settings`, { method: "PUT", body: JSON.stringify({ values }) }),
  importCookies: (sourceKey: string, url: string, cookies: string[]) => api(`/sources/${encodeURIComponent(sourceKey)}/cookies`, { method: "PUT", body: JSON.stringify({ url, cookies }) }),
  search: (sourceKey: string, keyword: string) => api<SearchResult>(`/search/${encodeURIComponent(sourceKey)}?keyword=${encodeURIComponent(keyword)}&page=1`),
  comicDetails: (sourceKey: string, comicId: string) => api<Details>(comicDetailPath(sourceKey, comicId)),
  episodePages: (sourceKey: string, comicId: string, episodeId: string) => api<{ images: string[] }>(episodePagesPath(sourceKey, comicId, episodeId)),
  listHistory: () => api<HistoryItem[]>("/library/history"),
  saveHistory: (sourceKey: string, comicId: string, episodeId: string) => api(`/library/history/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}`, { method: "PUT", body: JSON.stringify({ episodeId, page: 0, progress: 0 }) }),
  createDownload: (input: { sourceKey: string; comicId: string; episodeId?: string; all?: boolean }) => api<DownloadTask>("/downloads", { method: "POST", body: JSON.stringify(input) }),
  listDownloads: () => api<DownloadTask[]>("/downloads"),
  listDownloadItems: (taskId: string) => api<DownloadItem[]>(`/downloads/${encodeURIComponent(taskId)}/items`),
  retryDownloadItem: (taskId: string, imageKey: string) => api(`/downloads/${encodeURIComponent(taskId)}/items/retry`, { method: "POST", body: JSON.stringify({ imageKey }) }),
  cancelDownload: (taskId: string) => api(`/downloads/${encodeURIComponent(taskId)}/cancel`, { method: "POST" }),
  rerunDownload: (taskId: string) => api(`/downloads/${encodeURIComponent(taskId)}/rerun`, { method: "POST" }),
  exportDownloadCbz: (taskId: string) => api<{ path: string }>(`/downloads/${encodeURIComponent(taskId)}/cbz`, { method: "POST" }),
  deleteDownload: (taskId: string, files = false) => api(`/downloads/${encodeURIComponent(taskId)}${files ? "?files=true" : ""}`, { method: "DELETE" }),
  getCacheStats: () => api<CacheStats>("/settings/cache"),
  pruneCache: () => api<CacheStats>("/settings/cache/images/prune", { method: "POST" }),
  clearCache: () => api<CacheStats>("/settings/cache/images", { method: "DELETE" }),
};
