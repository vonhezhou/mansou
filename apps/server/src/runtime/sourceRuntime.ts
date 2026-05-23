import vm from "node:vm";
import path from "node:path";
import { SourceRepositoryService } from "../services/sourceRepository.js";
import type { Comic, ComicDetails, LoadedSource, VeneraComicSource } from "../types/source.js";
import { SourceDataStore } from "./dataStore.js";
import { createRuntimeApi } from "./runtimeApi.js";
import { fetchWithProxy } from "../utils/fetch.js";
import { SourceCookieStore } from "./cookieStore.js";
import { config } from "../config/config.js";

let sourceDataStore = new SourceDataStore();

function reportPluginAsyncError(sourceKey: string, error: unknown) {
  console.warn(`[${sourceKey}] plugin async task failed`, error);
}

function guardPluginAsync<T>(sourceKey: string, value: T): T {
  if (value && typeof (value as { catch?: unknown }).catch === "function") {
    (value as unknown as Promise<unknown>).catch((error) => reportPluginAsyncError(sourceKey, error));
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
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle : typeof raw.subTitle === "string" ? raw.subTitle : undefined,
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

export class SourceRuntime {
  private readonly sources = new Map<string, LoadedSource>();

  constructor(
    private readonly repository = new SourceRepositoryService(),
    private readonly dataStore = new SourceDataStore(),
    private readonly cookieStore = new SourceCookieStore(),
  ) {
    sourceDataStore = dataStore;
  }

  async loadInstalled() {
    const scripts = await this.repository.listInstalledScripts();
    const loaded: LoadedSource[] = [];
    for (const filePath of scripts) {
      try {
        loaded.push(await this.loadScript(filePath));
      } catch (error) {
        console.error(`Failed to load source ${filePath}:`, error);
      }
    }
    return loaded;
  }

  async loadScript(filePath: string) {
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
      fetch: (...args: Parameters<typeof fetchWithProxy>) => guardPluginAsync(preludeSourceKey, fetchWithProxy(...args)),
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
      },
      ComicSource: ComicSourceBase,
      ...api,
    };
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
      hasSearch: Boolean(_instance.search?.load || _instance.search?.loadNext),
      hasComic: Boolean(_instance.comic?.loadInfo),
    }));
  }

  find(sourceKey: string) {
    const source = this.sources.get(sourceKey);
    if (!source) throw new Error(`Source not loaded: ${sourceKey}`);
    return source;
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
    const search = source.search;
    if (!search) throw new Error(`Source does not support search: ${sourceKey}`);
    const finalOptions = options ?? this.defaultSearchOptions(sourceKey);
    if (search.load) {
      const page = Number(pageOrNext ?? 1);
      const result = await search.load(keyword, finalOptions, Number.isFinite(page) ? page : 1);
      return {
        comics: (result.comics ?? []).map((comic) => normalizeComic(comic as unknown as Record<string, unknown>, sourceKey)),
        maxPage: result.maxPage,
      };
    }
    if (search.loadNext) {
      const result = await search.loadNext(keyword, finalOptions, pageOrNext ?? null);
      return {
        comics: (result.comics ?? []).map((comic) => normalizeComic(comic as unknown as Record<string, unknown>, sourceKey)),
        next: result.next ?? null,
      };
    }
    throw new Error(`Source has invalid search config: ${sourceKey}`);
  }

  async aggregatedSearch(keyword: string, sourceKeys?: string[]) {
    const sources = sourceKeys?.length ? sourceKeys.map((key) => this.find(key)) : [...this.sources.values()];
    return Promise.all(
      sources
        .filter((source) => source.instance.search?.load || source.instance.search?.loadNext)
        .map(async (source) => {
          try {
            return { sourceKey: source.key, sourceName: source.name, result: await this.search(source.key, keyword) };
          } catch (error) {
            return { sourceKey: source.key, sourceName: source.name, error: error instanceof Error ? error.message : String(error) };
          }
        }),
    );
  }

  async comicDetails(sourceKey: string, comicId: string): Promise<ComicDetails> {
    const source = this.find(sourceKey).instance;
    if (!source.comic?.loadInfo) throw new Error(`Source does not support comic details: ${sourceKey}`);
    const raw = await source.comic.loadInfo(comicId);
    const normalized = normalizeValue(raw) as ComicDetails;
    return { ...normalized, chapters: normalizeChapters(normalized.chapters), sourceKey, comicId };
  }

  async comicPages(sourceKey: string, comicId: string, episodeId?: string | null) {
    const source = this.find(sourceKey).instance;
    if (!source.comic?.loadEp) throw new Error(`Source does not support comic pages: ${sourceKey}`);
    if (sourceKey === "baozi" && episodeId != null && episodeId !== "_default") {
      const images = await loadBaoziPages(comicId, episodeId);
      if (images.length > 0) return { images };
    }
    try {
      const result = await source.comic.loadEp(comicId, episodeId === "_default" ? null : episodeId);
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

  cookies(sourceKey: string) {
    this.find(sourceKey);
    return this.cookieStore.list(sourceKey);
  }

  importCookies(sourceKey: string, url: string, cookies: Array<string | Record<string, unknown>>) {
    this.find(sourceKey);
    return this.cookieStore.import(sourceKey, url, cookies);
  }

  clearCookies(sourceKey: string) {
    this.find(sourceKey);
    return this.cookieStore.clear(sourceKey);
  }

  sourceSettings(sourceKey: string) {
    const source = this.find(sourceKey).instance;
    return {
      schema: source.settings ?? {},
      values: (this.dataStore.loadSync(sourceKey, "settings") as Record<string, unknown> | undefined) ?? {},
    };
  }

  updateSourceSettings(sourceKey: string, values: Record<string, unknown>) {
    this.find(sourceKey);
    const current = (this.dataStore.loadSync(sourceKey, "settings") as Record<string, unknown> | undefined) ?? {};
    const next = { ...current, ...values };
    this.dataStore.saveSync(sourceKey, "settings", next);
    return this.sourceSettings(sourceKey);
  }

  clearSourceSettings(sourceKey: string) {
    this.find(sourceKey);
    this.dataStore.deleteSync(sourceKey, "settings");
    return this.sourceSettings(sourceKey);
  }
}

function thumbnailToImageUrl(url: string) {
  const imageUrl = url.replace(/\/([0-9]+)t\.([^/.]+)(?:\.webp)?$/, "/$1.$2");
  return imageUrl.replace("//t3.nhentai.net/", "//i3.nhentai.net/");
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
