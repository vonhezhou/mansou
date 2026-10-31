import type { components } from "@mansou/contracts";
import { api, apiBase } from "./client.js";
import type {
  AggregatedSearchItem,
  CacheStats,
  Details,
  DownloadItem,
  DownloadItemsPage,
  DownloadTask,
  Health,
  RepositorySource,
  RetryFailedDownloadImagesResult,
  SearchResult,
  SettingsResponse,
  SourceSettingsActionResult,
  SourceAuth,
  SourceLogin,
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
  const params = new URLSearchParams({ sourceKey, imageKey });
  // 原图使用默认加载路径，也避免复用旧版错误 thumbnail=false 响应的浏览器缓存。
  if (thumbnail) params.set("thumbnail", "true");
  if (comicId) params.set("comicId", comicId);
  if (episodeId) params.set("episodeId", episodeId);
  return `${apiBase}/image?${params}`;
}

export function downloadsEventUrl() {
  return `${apiBase}/downloads/events`;
}

export const mansouApi = {
  health: () => api<Health>("/health"),
  listInstalledSources: () => api<Source[]>("/sources/installed"),
  setSourceFavorite: (key: string, favorite: boolean) =>
    api<SourceMetadata>(`/sources/${encodeURIComponent(key)}/favorite`, {
      method: "PUT",
      body: JSON.stringify({ favorite }),
    }),
  listSourceMetadata: () => api<SourceMetadata[]>("/sources/metadata"),
  listAvailableSources: () => api<RepositorySource[]>("/sources/available"),
  installSource: (source: string) =>
    api("/sources/install", { method: "POST", body: JSON.stringify({ source }) }),
  getSourceRepository: () => api<components["schemas"]["SourceRepository"]>("/source-repository"),
  resetSourceRepository: () =>
    api<components["schemas"]["SourceRepository"]>("/source-repository/reset", { method: "POST" }),
  createSourceRepository: (settings: components["schemas"]["SubscriptionSettings"]) =>
    api<components["schemas"]["SourceRepository"]>("/source-repository", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  updateSourceRepository: (id: string, settings: components["schemas"]["SubscriptionSettings"]) =>
    api<components["schemas"]["SourceRepository"]>(`/source-repository/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  deleteSourceRepository: (id: string) =>
    api<components["schemas"]["SourceRepository"]>(`/source-repository/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  refreshRepository: () =>
    api<{ sources: RepositorySource[] }>("/source-repository/refresh", { method: "POST" }),
  uninstallSource: (key: string) =>
    api(`/sources/${encodeURIComponent(key)}`, { method: "DELETE" }),
  reloadSources: () => api("/sources/reload", { method: "POST" }),
  setSourceEnabled: (sourceKey: string, enabled: boolean) =>
    api(`/sources/${encodeURIComponent(sourceKey)}/enabled`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  getSourceAuth: (key: string) => api<SourceAuth>(`/sources/${encodeURIComponent(key)}/auth`),
  loginSource: (key: string, input: SourceLogin) =>
    api<SourceAuth>(`/sources/${encodeURIComponent(key)}/auth/login`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logoutSource: (key: string) =>
    api<SourceAuth>(`/sources/${encodeURIComponent(key)}/auth/logout`, { method: "POST" }),
  invokeSourceSetting: (key: string, setting: string) =>
    api<SourceSettingsActionResult>(
      `/sources/${encodeURIComponent(key)}/settings/${encodeURIComponent(setting)}/invoke`,
      { method: "POST" },
    ),
  respondToSourceDialog: (key: string, dialogId: string, buttonIndex: number | null) =>
    api<SourceSettingsActionResult>(
      `/sources/${encodeURIComponent(key)}/settings/dialogs/${encodeURIComponent(dialogId)}/respond`,
      {
        method: "POST",
        body: JSON.stringify({ buttonIndex }),
      },
    ),
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
  searchRecommendations: (sourceKey: string, signal?: AbortSignal) =>
    api<components["schemas"]["SearchRecommendationGroup"][]>(
      `/sources/${encodeURIComponent(sourceKey)}/search-recommendations`,
      { signal },
    ),
  search: (
    sourceKey: string,
    keyword: string,
    cursor?: { page?: number; next?: string | null },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({ keyword });
    if (cursor?.next) params.set("next", cursor.next);
    else params.set("page", String(cursor?.page ?? 1));
    return api<SearchResult>(
      `/search/${encodeURIComponent(sourceKey)}?${params}`,
      signal ? { signal } : undefined,
    );
  },
  aggregatedSearch: (keyword: string, sources?: string[]) => {
    const params = new URLSearchParams({ keyword });
    if (sources?.length) params.set("sources", sources.join(","));
    return api<AggregatedSearchItem[]>(`/search?${params}`);
  },
  comicDetails: (sourceKey: string, comicId: string) =>
    api<Details>(comicDetailPath(sourceKey, comicId)),
  episodePages: (sourceKey: string, comicId: string, episodeId: string, signal?: AbortSignal) =>
    api<{ images: string[] }>(
      episodePagesPath(sourceKey, comicId, episodeId),
      signal ? { signal } : undefined,
    ),
  createDownload: (input: {
    sourceKey: string;
    comicId: string;
    episodeId?: string;
    all?: boolean;
  }) => api<DownloadTask>("/downloads", { method: "POST", body: JSON.stringify(input) }),
  listDownloadItemsPage: (
    taskId: string,
    options: { offset?: number; limit?: number; failedOnly?: boolean } = {},
  ) => {
    const query = new URLSearchParams({
      offset: String(options.offset ?? 0),
      limit: String(options.limit ?? 100),
      failedOnly: String(options.failedOnly ?? false),
    });
    return api<DownloadItemsPage>(`/downloads/${encodeURIComponent(taskId)}/items/page?${query}`);
  },
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
