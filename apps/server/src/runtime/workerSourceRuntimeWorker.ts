import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createStorage } from "@venera/storage";
import { config } from "../config/config.js";
import { fetchWithProxy } from "../utils/fetch.js";
import { SourceCookieStore } from "./cookieStore.js";
import { SourceDataStore } from "./dataStore.js";
import { createRuntimeApi } from "./runtimeApi.js";

type Message = { id: number; method: string; args: unknown[] };

class ComicSourceBase {
  static sources: Record<string, unknown> = {};

  key = "";

  settings?: Record<string, { default?: unknown }>;

  loadSetting(key: string) {
    const values = this.key
      ? (sourceDataStore.loadSync(this.key, "settings") as Record<string, unknown> | undefined)
      : undefined;
    return values?.[key] ?? this.settings?.[key]?.default;
  }

  loadData(key: string) {
    if (!this.key) return undefined;
    return sourceDataStore.loadSync(this.key, key);
  }

  saveData(key: string, value: unknown) {
    if (!this.key) return undefined;
    return sourceDataStore.saveSync(this.key, key, value);
  }

  deleteData(key: string) {
    if (!this.key) return undefined;
    return sourceDataStore.deleteSync(this.key, key);
  }
}

const preludeSourceKey = path.basename(workerData.filePath, ".js");
const storage = createStorage(String(workerData.dataDir ?? config.dataDir));
const sourceDataStore = new SourceDataStore(storage);
const cookieStore = new SourceCookieStore(storage);
const api = await createRuntimeApi(preludeSourceKey, sourceDataStore, cookieStore);

const script = await readFile(workerData.filePath, "utf8");
const className = script.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/)?.[1];
if (!className) throw new Error("Invalid comic source: class extending ComicSource not found");

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Buffer,
  fetch: fetchWithProxy,
  randomInt: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
  Comic: class Comic {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
  ComicDetails: class ComicDetails {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
  UI: {
    showMessage: (...args: unknown[]) => console.info("[UI.showMessage]", ...args),
    showDialog: (...args: unknown[]) => console.info("[UI.showDialog]", ...args),
    toast: (...args: unknown[]) => console.info("[UI.toast]", ...args),
  },
  ComicSource: ComicSourceBase,
  ...api,
};
Object.assign(sandbox, {
  globalThis: sandbox,
  self: sandbox,
  window: sandbox,
  appVersion: config.appVersion,
});

const context = vm.createContext(sandbox);
const source = vm.runInContext(
  `${script}\n;globalThis.__source = new ${className}();\n;globalThis.__source;`,
  context,
  {
    filename: workerData.filePath,
    timeout: 5000,
  },
) as {
  key: string;
  name: string;
  version?: string;
  url?: string;
  init?: () => Promise<void> | void;
  search?: {
    load?: (keyword: string, options: string[], page: number) => unknown;
    loadNext?: (keyword: string, options: string[], next?: string | null) => unknown;
    optionList?: Array<{ default?: unknown; options?: string[] }>;
  };
  comic?: {
    loadInfo?: (id: string) => unknown;
    loadEp?: (id: string, ep?: string | null) => unknown;
    getImageLoadingConfig?: (imageKey: string, comicId: string, epId: string | null) => unknown;
    onImageLoad?: (imageKey: string, comicId: string, epId: string | null) => unknown;
    onLoadFailed?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
      error: Error,
    ) => unknown;
    onResponse?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
      response: Record<string, unknown>,
    ) => unknown;
    modifyImage?: (imageKey: string, comicId: string, epId: string | null, data: Buffer) => unknown;
  };
  getImageLoadingConfig?: (imageKey: string, comicId: string, epId: string | null) => unknown;
  getThumbnailLoadingConfig?: (imageKey: string) => unknown;
  onLoadFailed?: (imageKey: string, comicId: string, epId: string | null, error: Error) => unknown;
  onResponse?: (
    imageKey: string,
    comicId: string,
    epId: string | null,
    response: Record<string, unknown>,
  ) => unknown;
  modifyImage?: (imageKey: string, comicId: string, epId: string | null, data: Buffer) => unknown;
};

await source.init?.();
ComicSourceBase.sources[source.key] = source;

parentPort?.on("message", async (message: Message) => {
  try {
    const result = await dispatch(message.method, message.args);
    parentPort?.postMessage({ id: message.id, ok: true, result });
  } catch (error) {
    parentPort?.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function dispatch(method: string, args: unknown[]) {
  if (method === "metadata") {
    return {
      key: source.key,
      name: source.name,
      version: source.version ?? "0.0.0",
      url: source.url ?? "",
      filePath: workerData.filePath,
      instance: {
        key: source.key,
        name: source.name,
        version: source.version ?? "0.0.0",
        search: source.search ? {} : undefined,
        comic: source.comic ? {} : undefined,
      },
    };
  }
  if (method === "search") {
    const [keyword, pageOrNext, options] = args as [
      string,
      string | undefined,
      string[] | undefined,
    ];
    const finalOptions = options ?? defaultSearchOptions();
    if (source.search?.load)
      return normalizeSearchResult(
        await source.search.load(keyword, finalOptions, Number(pageOrNext ?? 1)),
      );
    if (source.search?.loadNext)
      return normalizeSearchResult(
        await source.search.loadNext(keyword, finalOptions, pageOrNext ?? null),
      );
  }
  if (method === "comicDetails") {
    const comicId = String(args[0]);
    const normalized = normalizeValue(await source.comic?.loadInfo?.(comicId)) as Record<
      string,
      unknown
    >;
    return {
      ...normalized,
      chapters: normalizeChapters(normalized.chapters),
      sourceKey: source.key,
      comicId,
    };
  }
  if (method === "comicPages")
    return normalizeValue(
      await source.comic?.loadEp?.(
        String(args[0]),
        args[1] == null || args[1] === "_default" ? null : String(args[1]),
      ),
    );
  if (method === "imageLoadingConfig") {
    const [imageKey, comicId, episodeId] = args as [string, string, string | null];
    const loader =
      source.comic?.getImageLoadingConfig ??
      source.comic?.onImageLoad ??
      source.getImageLoadingConfig;
    return normalizeLoadingConfig(await loader?.(imageKey, comicId, episodeId));
  }
  if (method === "imageLoadFailed") {
    const [imageKey, comicId, episodeId, message] = args as [string, string, string | null, string];
    const handler = source.comic?.onLoadFailed ?? source.onLoadFailed;
    return normalizeLoadingConfig(
      await handler?.(imageKey, comicId, episodeId, new Error(message)),
    );
  }
  if (method === "imageResponse") {
    const [imageKey, comicId, episodeId, response] = args as [
      string,
      string,
      string | null,
      Record<string, unknown>,
    ];
    const handler = source.comic?.onResponse ?? source.onResponse;
    return normalizeLoadingConfig(await handler?.(imageKey, comicId, episodeId, response));
  }
  if (method === "modifyImage") {
    const [imageKey, comicId, episodeId, data] = args as [string, string, string | null, number[]];
    const handler = source.comic?.modifyImage ?? source.modifyImage;
    const result = await handler?.(imageKey, comicId, episodeId, Buffer.from(data));
    const bytes = normalizeImageBytes(result);
    return bytes ? { data: Array.from(bytes) } : undefined;
  }
  if (method === "thumbnailLoadingConfig") {
    return normalizeLoadingConfig(await source.getThumbnailLoadingConfig?.(String(args[0])));
  }
  throw new Error(`Unsupported worker method: ${method}`);
}

function normalizeSearchResult(result: unknown) {
  const raw = normalizeValue(result) as {
    comics?: Array<Record<string, unknown>>;
    maxPage?: number;
    next?: string | null;
  };
  return { ...raw, comics: (raw.comics ?? []).map((comic) => normalizeComic(comic)) };
}

function normalizeComic(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    cover: String(raw.cover ?? ""),
    subtitle:
      typeof raw.subtitle === "string"
        ? raw.subtitle
        : typeof raw.subTitle === "string"
          ? raw.subTitle
          : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    description: typeof raw.description === "string" ? raw.description : "",
    sourceKey: source.key,
    maxPage: typeof raw.maxPage === "number" ? raw.maxPage : undefined,
    language: typeof raw.language === "string" ? raw.language : undefined,
    stars: typeof raw.stars === "number" ? raw.stars : undefined,
  };
}

function normalizeValue(value: unknown): unknown {
  if (
    value instanceof Map ||
    (value &&
      typeof value === "object" &&
      typeof (value as { entries?: unknown }).entries === "function" &&
      typeof (value as { size?: unknown }).size === "number")
  ) {
    return Object.fromEntries(
      [...(value as { entries: () => Iterable<[unknown, unknown]> }).entries()].map(
        ([key, item]) => [String(key), normalizeValue(item)],
      ),
    );
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]),
    );
  }
  return value;
}

function normalizeChapters(chapters: unknown): Record<string, string> | undefined {
  if (!chapters || typeof chapters !== "object" || Array.isArray(chapters)) return undefined;
  const flattened: Record<string, string> = {};
  for (const [key, value] of Object.entries(chapters as Record<string, unknown>)) {
    if (typeof value === "string") {
      flattened[key] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [episodeId, title] of Object.entries(value as Record<string, unknown>)) {
        if (typeof title === "string") flattened[episodeId] = title;
      }
    }
  }
  return Object.keys(flattened).length > 0 ? flattened : undefined;
}

function normalizeLoadingConfig(value: unknown) {
  const normalized = normalizeValue(value) as Record<string, unknown> | undefined;
  if (!normalized) return {};
  return Object.fromEntries(
    Object.entries(normalized).filter((entry) => typeof entry[1] !== "function"),
  );
}

function normalizeImageBytes(value: unknown): Buffer | undefined {
  if (value == null) return undefined;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value))
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && typeof value === "object" && "data" in value)
    return normalizeImageBytes((value as { data?: unknown }).data);
  return undefined;
}

function defaultSearchOptions() {
  return (source.search?.optionList ?? []).map((option) => {
    if (option.default !== undefined) return JSON.stringify(option.default);
    const first = option.options?.[0];
    return first?.split("-")[0] ?? "";
  });
}
