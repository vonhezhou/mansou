import vm from "node:vm";
import path from "node:path";
import { SourceRepositoryService } from "../services/sourceRepository.js";
import type { Comic, ComicDetails, LoadedSource, VeneraComicSource } from "../types/source.js";
import { SourceDataStore } from "./dataStore.js";
import { createRuntimeApi } from "./runtimeApi.js";
import { fetchWithProxy } from "../utils/fetch.js";
import { SourceCookieStore } from "./cookieStore.js";
import { config } from "../config/config.js";
import { classifyPluginError, PluginRuntimeError } from "./errors.js";
import { WorkerSourceRuntimeAdapter } from "./workerSourceRuntime.js";

let sourceDataStore = new SourceDataStore();

function reportPluginAsyncError(sourceKey: string, error: unknown) {
  console.warn(`[${sourceKey}] plugin async task failed`, error);
}

function guardPluginAsync<T>(sourceKey: string, value: T): T {
  if (value && typeof (value as { catch?: unknown }).catch === "function") {
    (value as unknown as Promise<unknown>).catch((error) =>
      reportPluginAsyncError(sourceKey, error),
    );
  }
  return value;
}

function createGuardedTimeout(sourceKey: string) {
  return (callback: (...args: unknown[]) => unknown, delay?: number, ...args: unknown[]) =>
    setTimeout(() => {
      try {
        guardPluginAsync(sourceKey, callback(...args));
      } catch (error) {
        reportPluginAsyncError(sourceKey, error);
      }
    }, delay);
}

function createGuardedInterval(sourceKey: string) {
  return (callback: (...args: unknown[]) => unknown, delay?: number, ...args: unknown[]) =>
    setInterval(() => {
      try {
        guardPluginAsync(sourceKey, callback(...args));
      } catch (error) {
        reportPluginAsyncError(sourceKey, error);
      }
    }, delay);
}

function createGuardedPromise(sourceKey: string) {
  function GuardedPromise<T>(this: unknown, executor: ConstructorParameters<typeof Promise<T>>[0]) {
    return guardPluginAsync(sourceKey, new Promise<T>(executor));
  }
  Object.setPrototypeOf(GuardedPromise, Promise);
  GuardedPromise.prototype = Promise.prototype;
  return GuardedPromise;
}

class ComicSourceBase {
  static sources: Record<string, VeneraComicSource> = {};

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

function findClassName(script: string) {
  const match = script.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/);
  if (!match) throw new Error("Invalid comic source: class extending ComicSource not found");
  return match[1];
}

function normalizeComic(raw: Record<string, unknown>, sourceKey: string): Comic {
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
    sourceKey,
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

class PluginCallTimeoutError extends Error {
  constructor(sourceKey: string, operation: string, timeoutMs: number) {
    super(`Plugin call timed out: ${sourceKey}.${operation} after ${timeoutMs}ms`);
    this.name = "PluginCallTimeoutError";
  }
}

type SourceLimiter = { active: number; queue: Array<() => void> };
type RuntimeDiagnostic = {
  time: string;
  sourceKey?: string;
  operation: string;
  code: string;
  message: string;
  stack?: string[];
};

export class SourceRuntime {
  private readonly sources = new Map<string, LoadedSource>();
  private readonly workerSources = new Map<string, WorkerSourceRuntimeAdapter>();
  private readonly sourceLimiters = new Map<string, SourceLimiter>();
  private readonly recentErrors: RuntimeDiagnostic[] = [];
  private readonly failedLoads: RuntimeDiagnostic[] = [];
  private reloadPromise?: Promise<LoadedSource[]>;

  constructor(
    private readonly repository = new SourceRepositoryService(),
    private readonly dataStore = new SourceDataStore(),
    private readonly cookieStore = new SourceCookieStore(),
  ) {
    sourceDataStore = dataStore;
  }

  async loadInstalled() {
    if (this.reloadPromise) return this.reloadPromise;
    this.reloadPromise = this.loadInstalledOnce().finally(() => {
      this.reloadPromise = undefined;
    });
    return this.reloadPromise;
  }

  private async loadInstalledOnce() {
    const scripts = await this.repository.listInstalledScripts();
    const loaded: LoadedSource[] = [];
    await this.closeWorkers();
    this.sources.clear();
    for (const filePath of scripts) {
      try {
        const key = path.basename(filePath, ".js");
        const metadata = this.dataStore.storage?.getSource?.(key) as
          | { enabled?: number }
          | null
          | undefined;
        if (metadata?.enabled === 0) continue;
        loaded.push(await this.loadScript(filePath));
      } catch (error) {
        this.recordError({
          sourceKey: path.basename(filePath, ".js"),
          operation: "source.load",
          error,
        });
        console.error(`Failed to load source ${filePath}:`, error);
      }
    }
    return loaded;
  }

  async loadScript(filePath: string) {
    if (config.pluginIsolation === "worker") {
      const adapter = await WorkerSourceRuntimeAdapter.load(filePath, (sourceKey, error) =>
        this.handleWorkerCrash(sourceKey, error),
      );
      await this.workerSources.get(adapter.source.key)?.close();
      this.workerSources.set(adapter.source.key, adapter);
      this.sources.set(adapter.source.key, adapter.source);
      return adapter.source;
    }
    const script = await this.repository.readScript(filePath);
    const className = findClassName(script);
    const preludeSourceKey = path.basename(filePath, ".js");
    const api = await createRuntimeApi(preludeSourceKey, this.dataStore, this.cookieStore);
    const GuardedPromise = createGuardedPromise(preludeSourceKey);
    const sandbox = {
      console,
      setTimeout: createGuardedTimeout(preludeSourceKey),
      setInterval: createGuardedInterval(preludeSourceKey),
      clearTimeout,
      clearInterval,
      Promise: GuardedPromise,
      fetch: (...args: Parameters<typeof fetchWithProxy>) =>
        guardPluginAsync(preludeSourceKey, fetchWithProxy(...args)),
      randomInt: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
      URL,
      URLSearchParams,
      TextDecoder,
      TextEncoder,
      Buffer,
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
      APP: api.App,
      App: api.App,
      app: api.App,
      appVersion: config.appVersion,
    });
    const context = vm.createContext(sandbox);
    const instance = vm.runInContext(
      `${script}\n;globalThis.__source = new ${className}();\n;globalThis.__source;`,
      context,
      { filename: filePath, timeout: 5000 },
    ) as VeneraComicSource;

    if (!instance.key || !instance.name) {
      throw new Error("Invalid comic source: key/name is required");
    }
    if (typeof instance.init === "function") {
      try {
        await instance.init();
      } catch (error) {
        console.warn(`Source init failed: ${instance.key}`, error);
      }
    }
    ComicSourceBase.sources[instance.key] = instance;
    const loaded = {
      key: instance.key,
      name: instance.name,
      version: instance.version ?? "0.0.0",
      url: instance.url ?? "",
      filePath,
      instance,
    };
    this.sources.set(instance.key, loaded);
    return loaded;
  }

  all() {
    return [...this.sources.values()].map(({ instance: _instance, ...source }) => ({
      ...source,
      enabled: true,
      hasSearch:
        this.workerSources.has(source.key) ||
        Boolean(_instance.search?.load || _instance.search?.loadNext),
      hasComic: this.workerSources.has(source.key) || Boolean(_instance.comic?.loadInfo),
    }));
  }

  find(sourceKey: string) {
    const source = this.sources.get(sourceKey);
    if (!source)
      throw new PluginRuntimeError(
        "SOURCE_NOT_LOADED",
        `Source not loaded: ${sourceKey}`,
        sourceKey,
      );
    return source;
  }

  diagnostics() {
    return {
      isolation: config.pluginIsolation,
      loadedSources: this.all(),
      failedLoads: this.failedLoads,
      recentErrors: this.recentErrors,
      workers: [...this.workerSources.values()].map((worker) => worker.diagnostics()),
      sourceConcurrency: [...this.sourceLimiters.entries()].map(([sourceKey, limiter]) => ({
        sourceKey,
        active: limiter.active,
        queued: limiter.queue.length,
      })),
    };
  }

  async close() {
    await this.closeWorkers();
    this.sources.clear();
  }

  searchOptions(sourceKey: string) {
    return this.find(sourceKey).instance.search?.optionList ?? [];
  }

  defaultSearchOptions(sourceKey: string) {
    return this.searchOptions(sourceKey).map((option) => {
      if (option.default !== undefined) return JSON.stringify(option.default);
      const first = option.options?.[0];
      return first?.split("-")[0] ?? "";
    });
  }

  async search(sourceKey: string, keyword: string, pageOrNext?: string, options?: string[]) {
    const source = this.find(sourceKey).instance;
    const worker = this.workerSources.get(sourceKey);
    if (worker) return worker.search(keyword, pageOrNext, options);
    const search = source.search;
    if (!search) throw new Error(`Source does not support search: ${sourceKey}`);
    const finalOptions = options ?? this.defaultSearchOptions(sourceKey);
    if (search.load) {
      const page = Number(pageOrNext ?? 1);
      const result = await this.runPluginCall(sourceKey, "search.load", () =>
        search.load!(keyword, finalOptions, Number.isFinite(page) ? page : 1),
      );
      return {
        comics: (result.comics ?? []).map((comic) =>
          normalizeComic(comic as unknown as Record<string, unknown>, sourceKey),
        ),
        maxPage: result.maxPage,
      };
    }
    if (search.loadNext) {
      const result = await this.runPluginCall(sourceKey, "search.loadNext", () =>
        search.loadNext!(keyword, finalOptions, pageOrNext ?? null),
      );
      return {
        comics: (result.comics ?? []).map((comic) =>
          normalizeComic(comic as unknown as Record<string, unknown>, sourceKey),
        ),
        next: result.next ?? null,
      };
    }
    throw new Error(`Source has invalid search config: ${sourceKey}`);
  }

  async aggregatedSearch(keyword: string, sourceKeys?: string[]) {
    const sources = sourceKeys?.length
      ? sourceKeys.map((key) => this.find(key))
      : [...this.sources.values()];
    return Promise.all(
      sources
        .filter((source) => source.instance.search?.load || source.instance.search?.loadNext)
        .map(async (source) => {
          try {
            return {
              sourceKey: source.key,
              sourceName: source.name,
              result: await this.search(source.key, keyword),
            };
          } catch (error) {
            return {
              sourceKey: source.key,
              sourceName: source.name,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
    );
  }

  async comicDetails(sourceKey: string, comicId: string): Promise<ComicDetails> {
    const source = this.find(sourceKey).instance;
    const worker = this.workerSources.get(sourceKey);
    if (worker) return worker.comicDetails(comicId);
    if (!source.comic?.loadInfo)
      throw new Error(`Source does not support comic details: ${sourceKey}`);
    const raw = await this.runPluginCall(sourceKey, "comic.loadInfo", () =>
      source.comic!.loadInfo!(comicId),
    );
    const normalized = normalizeValue(raw) as ComicDetails;
    return { ...normalized, chapters: normalizeChapters(normalized.chapters), sourceKey, comicId };
  }

  async comicPages(sourceKey: string, comicId: string, episodeId?: string | null) {
    const source = this.find(sourceKey).instance;
    if (sourceKey === "baozi" && episodeId != null && episodeId !== "_default") {
      const images = await loadBaoziPages(comicId, episodeId);
      if (images.length > 0) return { images };
    }
    const worker = this.workerSources.get(sourceKey);
    if (worker) {
      try {
        const result = await worker.comicPages(comicId, episodeId);
        if (result.images?.length) return result;
        if (sourceKey === "baozi" && episodeId != null && episodeId !== "_default") {
          const images = await loadBaoziPages(comicId, episodeId);
          if (images.length > 0) return { images };
        }
        if (sourceKey === "comick" && episodeId != null && episodeId !== "_default") {
          const images = await loadComickPages(comicId, episodeId);
          if (images.length > 0) return { images };
        }
        return result;
      } catch (error) {
        if (sourceKey === "baozi" && episodeId != null && episodeId !== "_default") {
          const images = await loadBaoziPages(comicId, episodeId);
          if (images.length > 0) return { images };
        }
        if (sourceKey === "comick" && episodeId != null && episodeId !== "_default") {
          const images = await loadComickPages(comicId, episodeId);
          if (images.length > 0) return { images };
        }
        throw error;
      }
    }
    if (!source.comic?.loadEp) throw new Error(`Source does not support comic pages: ${sourceKey}`);
    try {
      const result = await this.runPluginCall(sourceKey, "comic.loadEp", () =>
        source.comic!.loadEp!(comicId, episodeId === "_default" ? null : episodeId),
      );
      return { images: result.images ?? [] };
    } catch (error) {
      if (sourceKey === "baozi" && episodeId != null && episodeId !== "_default") {
        const images = await loadBaoziPages(comicId, episodeId);
        if (images.length > 0) return { images };
      }
      const details = await this.comicDetails(sourceKey, comicId);
      if (details.thumbnails?.length) {
        return { images: details.thumbnails.map((url) => thumbnailToImageUrl(url)) };
      }
      throw error;
    }
  }

  async imageLoadingConfig(
    sourceKey: string,
    imageKey: string,
    comicId: string,
    episodeId: string | null,
    thumbnail = false,
  ) {
    const source = this.find(sourceKey).instance;
    const worker = this.workerSources.get(sourceKey);
    if (thumbnail) {
      if (worker) return worker.thumbnailLoadingConfig(imageKey);
      return source.getThumbnailLoadingConfig?.(imageKey) ?? {};
    }
    if (worker) return worker.imageLoadingConfig(imageKey, comicId, episodeId);
    const loader =
      source.comic?.getImageLoadingConfig ??
      source.comic?.onImageLoad ??
      source.getImageLoadingConfig;
    return normalizeLoadingConfig((await loader?.(imageKey, comicId, episodeId)) ?? {});
  }

  async imageLoadFailed(
    sourceKey: string,
    imageKey: string,
    comicId: string,
    episodeId: string | null,
    error: Error,
  ) {
    const source = this.find(sourceKey).instance;
    const worker = this.workerSources.get(sourceKey);
    if (worker) return worker.imageLoadFailed(imageKey, comicId, episodeId, error.message);
    const handler = source.comic?.onLoadFailed ?? source.onLoadFailed;
    return normalizeLoadingConfig((await handler?.(imageKey, comicId, episodeId, error)) ?? {});
  }

  async imageResponse(
    sourceKey: string,
    imageKey: string,
    comicId: string,
    episodeId: string | null,
    response: { status: number; headers: Record<string, string>; url: string },
  ) {
    const source = this.find(sourceKey).instance;
    const worker = this.workerSources.get(sourceKey);
    if (worker) return worker.imageResponse(imageKey, comicId, episodeId, response);
    const handler = source.comic?.onResponse ?? source.onResponse;
    return normalizeLoadingConfig((await handler?.(imageKey, comicId, episodeId, response)) ?? {});
  }

  async modifyImage(
    sourceKey: string,
    imageKey: string,
    comicId: string,
    episodeId: string | null,
    data: Buffer,
  ) {
    const source = this.find(sourceKey).instance;
    const worker = this.workerSources.get(sourceKey);
    if (worker) {
      const result = await worker.modifyImage(imageKey, comicId, episodeId, Array.from(data));
      return result?.data ? Buffer.from(result.data) : data;
    }
    const handler = source.comic?.modifyImage ?? source.modifyImage;
    const result = await handler?.(imageKey, comicId, episodeId, data);
    return normalizeImageBytes(result) ?? data;
  }

  cookies(sourceKey: string) {
    this.find(sourceKey);
    return this.cookieStore.list(sourceKey);
  }

  async importCookies(
    sourceKey: string,
    url: string,
    cookies: Array<string | Record<string, unknown>> | string,
  ) {
    const source = this.find(sourceKey);
    const imported = await this.cookieStore.import(sourceKey, url, cookies);
    if (this.workerSources.has(sourceKey)) await this.loadScript(source.filePath);
    return imported;
  }

  async clearCookies(sourceKey: string) {
    const source = this.find(sourceKey);
    await this.cookieStore.clear(sourceKey);
    if (this.workerSources.has(sourceKey)) await this.loadScript(source.filePath);
  }

  sourceSettings(sourceKey: string) {
    const source = this.find(sourceKey).instance;
    return {
      schema: source.settings ?? {},
      values:
        (this.dataStore.loadSync(sourceKey, "settings") as Record<string, unknown> | undefined) ??
        {},
    };
  }

  updateSourceSettings(sourceKey: string, values: Record<string, unknown>) {
    this.find(sourceKey);
    const current =
      (this.dataStore.loadSync(sourceKey, "settings") as Record<string, unknown> | undefined) ?? {};
    const next = { ...current, ...values };
    this.dataStore.saveSync(sourceKey, "settings", next);
    return this.sourceSettings(sourceKey);
  }

  clearSourceSettings(sourceKey: string) {
    this.find(sourceKey);
    this.dataStore.deleteSync(sourceKey, "settings");
    return this.sourceSettings(sourceKey);
  }

  private async runPluginCall<T>(
    sourceKey: string,
    operation: string,
    task: () => Promise<T> | T,
  ): Promise<T> {
    await this.acquireSourceSlot(sourceKey);
    try {
      return await withTimeout(
        Promise.resolve().then(task),
        config.pluginCallTimeoutMs,
        sourceKey,
        operation,
      );
    } catch (error) {
      this.recordError({ sourceKey, operation, error });
      throw classifyPluginError(error, sourceKey, operation);
    } finally {
      this.releaseSourceSlot(sourceKey);
    }
  }

  private recordError(input: { sourceKey?: string; operation: string; error: unknown }) {
    const error = classifyPluginError(input.error, input.sourceKey, input.operation);
    const diagnostic = {
      time: new Date().toISOString(),
      sourceKey: input.sourceKey,
      operation: input.operation,
      code: error.code,
      message: error.message,
      stack: getShortStack(error.cause ?? input.error),
    };
    this.recentErrors.unshift(diagnostic);
    if (this.recentErrors.length > 100) this.recentErrors.length = 100;
    if (input.operation === "source.load") this.failedLoads.unshift(diagnostic);
  }

  private acquireSourceSlot(sourceKey: string) {
    const limiter = this.sourceLimiters.get(sourceKey) ?? { active: 0, queue: [] };
    this.sourceLimiters.set(sourceKey, limiter);
    const limit = Math.max(1, config.pluginSourceConcurrency);
    if (limiter.active < limit) {
      limiter.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      limiter.queue.push(() => {
        limiter.active += 1;
        resolve();
      });
    });
  }

  private releaseSourceSlot(sourceKey: string) {
    const limiter = this.sourceLimiters.get(sourceKey);
    if (!limiter) return;
    limiter.active = Math.max(0, limiter.active - 1);
    const next = limiter.queue.shift();
    if (next) next();
  }

  private async closeWorkers() {
    const workers = [...this.workerSources.values()];
    this.workerSources.clear();
    await Promise.all(workers.map((worker) => worker.close().catch(() => undefined)));
  }

  private handleWorkerCrash(sourceKey: string, error: Error) {
    const current = this.workerSources.get(sourceKey);
    if (current) this.workerSources.delete(sourceKey);
    this.recordError({ sourceKey, operation: "worker.crash", error });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  sourceKey: string,
  operation: string,
) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new PluginCallTimeoutError(sourceKey, operation, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function thumbnailToImageUrl(url: string) {
  const imageUrl = url.replace(/\/([0-9]+)t\.([^/.]+)(?:\.webp)?$/, "/$1.$2");
  return imageUrl.replace("//t3.nhentai.net/", "//i3.nhentai.net/");
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

function getShortStack(error: unknown) {
  if (!(error instanceof Error) || !error.stack) return undefined;
  return error.stack.split("\n").slice(0, 6);
}

async function loadBaoziPages(comicId: string, episodeId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const directUrl = `https://cn.bzmgcn.com/user/page_direct?comic_id=${encodeURIComponent(
    comicId,
  )}&section_slot=0&chapter_slot=${encodeURIComponent(episodeId)}`;
  try {
    const response = await fetch(directUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        referer: "https://cn.bzmgcn.com/",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const location = response.headers.get("location");
    const pageUrl = location ? new URL(location, directUrl).toString() : directUrl;
    const pageResponse = await fetch(pageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        referer: "https://cn.bzmgcn.com/",
      },
      signal: controller.signal,
    });
    if (!pageResponse.ok) return [];
    const html = await pageResponse.text();
    return [...html.matchAll(/data-src=["']([^"']+)["']/g)].map((match) => match[1]);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadComickPages(comicId: string, episodeId: string) {
  const [slug] = comicId.split("//");
  const [hid, type, chapter, lang] = episodeId.split("//");
  if (!slug || !hid || !type || !chapter || !lang) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const suffix = type === "no" ? hid : `${hid}-${type}-${chapter}-${lang}`;
    const response = await fetch(`https://comick.art/comic/${encodeURIComponent(slug)}/${suffix}`, {
      headers: { "user-agent": "Mozilla/5.0", referer: "https://comick.art/" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const html = await response.text();
    const match = html.match(/<script[^>]+id=["']sv-data["'][^>]*>([\s\S]*?)<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const images = data?.chapter?.images;
    return Array.isArray(images)
      ? images.map((image) => String(image?.url ?? "")).filter(Boolean)
      : [];
  } finally {
    clearTimeout(timeout);
  }
}
