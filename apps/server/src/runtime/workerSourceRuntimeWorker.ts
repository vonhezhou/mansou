import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
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
    const values = this.key ? (sourceDataStore.loadSync(this.key, "settings") as Record<string, unknown> | undefined) : undefined;
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
const sourceDataStore = new SourceDataStore();
const cookieStore = new SourceCookieStore();
const api = await createRuntimeApi(preludeSourceKey, sourceDataStore, cookieStore);

const script = await readFile(workerData.filePath, "utf8");
const className = script.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/)?.[1];
if (!className) throw new Error("Invalid comic source: class extending ComicSource not found");

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
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
  },
  ComicSource: ComicSourceBase,
  ...api,
};

const context = vm.createContext(sandbox);
const source = vm.runInContext(`${script}\n;globalThis.__source = new ${className}();\n;globalThis.__source;`, context, {
  filename: workerData.filePath,
  timeout: 5000,
}) as {
  key: string;
  name: string;
  version?: string;
  url?: string;
  init?: () => Promise<void> | void;
  search?: { load?: (keyword: string, options: string[], page: number) => unknown; loadNext?: (keyword: string, options: string[], next?: string | null) => unknown; optionList?: Array<{ default?: unknown; options?: string[] }> };
  comic?: { loadInfo?: (id: string) => unknown; loadEp?: (id: string, ep?: string | null) => unknown };
};

await source.init?.();
ComicSourceBase.sources[source.key] = source;

parentPort?.on("message", async (message: Message) => {
  try {
    const result = await dispatch(message.method, message.args);
    parentPort?.postMessage({ id: message.id, ok: true, result });
  } catch (error) {
    parentPort?.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
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
    const [keyword, pageOrNext, options] = args as [string, string | undefined, string[] | undefined];
    const finalOptions = options ?? defaultSearchOptions();
    if (source.search?.load) return normalizeSearchResult(await source.search.load(keyword, finalOptions, Number(pageOrNext ?? 1)));
    if (source.search?.loadNext) return normalizeSearchResult(await source.search.loadNext(keyword, finalOptions, pageOrNext ?? null));
  }
  if (method === "comicDetails") {
    const comicId = String(args[0]);
    return { ...(normalizeValue(await source.comic?.loadInfo?.(comicId)) as Record<string, unknown>), sourceKey: source.key, comicId };
  }
  if (method === "comicPages") return normalizeValue(await source.comic?.loadEp?.(String(args[0]), args[1] == null || args[1] === "_default" ? null : String(args[1])));
  throw new Error(`Unsupported worker method: ${method}`);
}

function normalizeSearchResult(result: unknown) {
  const raw = normalizeValue(result) as { comics?: Array<Record<string, unknown>>; maxPage?: number; next?: string | null };
  return { ...raw, comics: (raw.comics ?? []).map((comic) => normalizeComic(comic)) };
}

function normalizeComic(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    cover: String(raw.cover ?? ""),
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle : typeof raw.subTitle === "string" ? raw.subTitle : undefined,
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
      [...((value as { entries: () => Iterable<[unknown, unknown]> }).entries())].map(([key, item]) => [
        String(key),
        normalizeValue(item),
      ]),
    );
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }
  return value;
}

function defaultSearchOptions() {
  return (source.search?.optionList ?? []).map((option) => {
    if (option.default !== undefined) return JSON.stringify(option.default);
    const first = option.options?.[0];
    return first?.split("-")[0] ?? "";
  });
}
