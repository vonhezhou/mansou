import type { components } from "@mansou/contracts";
import { api, apiBase } from "./client.js";
export type NovelSource = components["schemas"]["NovelSource"];
export type NovelState = components["schemas"]["NovelState"];
export type NovelSubscription = components["schemas"]["NovelSubscription"];
export type NovelSearch = components["schemas"]["NovelSearch"];
export type NovelOrigin = components["schemas"]["NovelOrigin"];
export type NovelCatalog = components["schemas"]["NovelCatalog"];
export type NovelTask = components["schemas"]["NovelTask"];
const call = <T>(path: string, body?: unknown, method = "POST", signal?: AbortSignal) =>
  api<T>(`/novels${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
export const novelApi = {
  state: () => api<NovelState>("/novels/sources"),
  import: (sources: unknown) => call<NovelState>("/sources/import", { sources }),
  rule: (id: string) =>
    api<Record<string, unknown>>(`/novels/sources/${encodeURIComponent(id)}/rule`),
  enabled: (id: string, enabled: boolean) =>
    call<NovelState>(`/sources/${encodeURIComponent(id)}`, { enabled }, "PUT"),
  removeSource: (id: string) =>
    call<NovelState>(`/sources/${encodeURIComponent(id)}`, undefined, "DELETE"),
  subscription: (settings: components["schemas"]["NovelSubscriptionRequest"], id?: string) =>
    call<NovelState>(
      `/subscriptions${id ? `/${encodeURIComponent(id)}` : ""}`,
      settings,
      id ? "PUT" : "POST",
    ),
  refresh: (id: string) => call<NovelState>(`/subscriptions/${encodeURIComponent(id)}/refresh`),
  removeSubscription: (id: string) =>
    call<NovelState>(`/subscriptions/${encodeURIComponent(id)}`, undefined, "DELETE"),
  search: (keyword: string, page: number, sourceIds: string[], signal?: AbortSignal) =>
    call<NovelSearch>("/search", { keyword, page, sourceIds }, "POST", signal),
  catalog: (origin: NovelOrigin) =>
    call<NovelCatalog>("/catalog", { sourceId: origin.sourceId, bookUrl: origin.bookUrl }),
  tasks: () => api<NovelTask[]>("/novels/downloads"),
  download: (origin: NovelOrigin, all: boolean, start: number, limit: number) =>
    call<NovelTask>("/downloads", { sourceId: origin.sourceId, book: origin, all, start, limit }),
  action: (id: string, action: "pause" | "resume" | "cancel" | "delete") =>
    call<NovelTask>(
      `/downloads/${encodeURIComponent(id)}${action === "delete" ? "" : `/${action}`}`,
      undefined,
      action === "delete" ? "DELETE" : "POST",
    ),
  txtUrl: (id: string) => `${apiBase}/novels/downloads/${encodeURIComponent(id)}/txt`,
};
