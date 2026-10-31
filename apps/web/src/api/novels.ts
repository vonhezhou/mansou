import type { components } from "@mansou/contracts";
import { api, apiBase } from "./client.js";
import { searchNovels } from "./novelSearch.js";
export type NovelBook = components["schemas"]["NovelBook"];
export type NovelSource = components["schemas"]["NovelSource"];
export type NovelState = components["schemas"]["NovelState"];
export type NovelImportResult = components["schemas"]["NovelImportResult"];
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
  state: (signal?: AbortSignal) => api<NovelState>("/novels/sources", { signal }),
  import: (sources: unknown) => call<NovelImportResult>("/sources/import", { sources }),
  batch: (ids: string[], action: "enable" | "disable" | "delete") =>
    call<NovelState>("/sources/batch", { ids, action }),
  rule: (id: string) =>
    api<Record<string, unknown>>(`/novels/sources/${encodeURIComponent(id)}/rule`),
  favorite: (id: string, favorite: boolean) =>
    call<NovelState>(`/sources/${encodeURIComponent(id)}/favorite`, { favorite }, "PUT"),
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
  search: searchNovels,
  catalog: (origin: NovelOrigin, signal?: AbortSignal) =>
    call<NovelCatalog>(
      "/catalog",
      { sourceId: origin.sourceId, bookUrl: origin.bookUrl },
      "POST",
      signal,
    ),
  tasks: (signal?: AbortSignal) => api<NovelTask[]>("/novels/downloads", { signal }),
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
