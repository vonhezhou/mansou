import { NovelEngineExecutor } from "./engineExecutor.js";
import { createHash, randomUUID } from "node:crypto";
import {
  parseSources,
  assertSupported,
  assertDownloadSupported,
  fetchHtml,
  type Catalog,
  searchAll,
  type BookSource,
  type RegisteredSource,
  type SourceOutcome,
} from "@mansou/novel-engine";
import type { components } from "@mansou/contracts";
import type { StorageDatabase } from "@mansou/storage";
import { AppError } from "../../errors.js";

type Source = components["schemas"]["NovelSource"];
type Subscription = components["schemas"]["NovelSubscription"];
type Settings = components["schemas"]["NovelSubscriptionRequest"];
export type SourceRecord = { summary: Source; raw: BookSource };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const local: Subscription = { id: "local", name: "自定义书源", enabled: true, count: 0 };

export class NovelSourceService {
  private mutation: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly db: StorageDatabase["novels"],
    private readonly fetcher: typeof fetch,
    private readonly timeoutMs: number,
    private readonly engine: NovelEngineExecutor,
  ) {}
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(work);
    this.mutation = next.catch(() => {});
    return next;
  }
  state(): components["schemas"]["NovelState"] {
    const sources = this.db.list<SourceRecord>("source").map((row) => row.summary);
    const subscriptions = [local, ...this.db.list<Subscription>("subscription")].map((group) => ({
      ...group,
      count: sources.filter((source) => source.groupId === group.id).length,
    }));
    return { sources, subscriptions };
  }
  source(id: string, requireEnabled = true): SourceRecord {
    const row = this.db.get<SourceRecord>("source", id);
    if (!row) throw new AppError("SOURCE_NOT_FOUND", "书源不存在");
    const group =
      row.summary.groupId === "local"
        ? local
        : this.db.get<Subscription>("subscription", row.summary.groupId);
    if (requireEnabled && (!row.summary.enabled || !group?.enabled))
      throw new AppError("VALIDATION_ERROR", "书源或订阅尚未启用");
    return row;
  }
  private record(raw: BookSource, groupId: string): SourceRecord {
    const id = `${groupId}:${hash(raw.bookSourceUrl).slice(0, 16)}`;
    const old = this.db.get<SourceRecord>("source", id);
    let searchError: string | undefined, downloadError: string | undefined;
    try {
      assertSupported(raw);
    } catch (error) {
      searchError = String(error instanceof Error ? error.message : error);
    }
    try {
      assertDownloadSupported(raw);
    } catch (error) {
      downloadError = String(error instanceof Error ? error.message : error);
    }
    return {
      raw,
      summary: {
        id,
        groupId,
        name: raw.bookSourceName,
        url: raw.bookSourceUrl,
        hash: hash(JSON.stringify(raw)),
        enabled: old?.summary.enabled ?? raw.enabled !== false,
        searchSupported: !searchError,
        downloadSupported: !downloadError,
        searchError,
        downloadError,
      },
    };
  }
  import(input: unknown) {
    const values = parseSources(input);
    this.db.transaction(() => {
      for (const value of values) {
        const row = this.record(value, "local");
        this.db.save("source", row.summary.id, row);
      }
    });
    return this.state();
  }
  setEnabled(id: string, enabled: boolean) {
    const row = this.source(id, false);
    row.summary.enabled = enabled;
    this.db.save("source", id, row);
    return this.state();
  }
  deleteSource(id: string) {
    this.source(id, false);
    this.db.delete("source", id);
    return this.state();
  }
  private subscription(id: string) {
    const group = this.db.get<Subscription>("subscription", id);
    if (!group) throw new AppError("SOURCE_NOT_FOUND", "书源订阅不存在");
    return group;
  }
  private async fetchSources(url: string) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new AppError("VALIDATION_ERROR", "订阅需要不含凭据的 HTTP/HTTPS 地址");
    const response = await fetchHtml(
      { url: parsed.href, method: "GET", headers: {}, charset: "utf-8" },
      AbortSignal.timeout(this.timeoutMs),
      8 * 1024 * 1024,
      this.fetcher,
    );
    let input: unknown;
    try {
      input = JSON.parse(response.html);
    } catch {
      throw new AppError("VALIDATION_ERROR", "订阅未返回书源 JSON；管理页订阅规则暂不支持");
    }
    return parseSources(input);
  }
  private replace(group: Subscription, sources: BookSource[]) {
    this.db.transaction(() => {
      const records = sources.map((raw) => this.record(raw, group.id));
      const ids = new Set(records.map((row) => row.summary.id));
      for (const old of this.db.list<SourceRecord>("source"))
        if (old.summary.groupId === group.id && !ids.has(old.summary.id))
          this.db.delete("source", old.summary.id);
      for (const row of records) this.db.save("source", row.summary.id, row);
      this.db.save("subscription", group.id, {
        ...group,
        count: sources.length,
        updatedAt: new Date().toISOString(),
        error: undefined,
      });
    });
    return this.state();
  }
  saveSubscription(settings: Settings, id?: string) {
    return this.serialize(async () => {
      const old = id ? this.subscription(id) : undefined;
      const url = new URL(settings.url).href;
      if (
        this.db
          .list<Subscription>("subscription")
          .some((group) => group.id !== id && group.url === url)
      )
        throw new AppError("VALIDATION_ERROR", "订阅地址已存在");
      const group: Subscription = {
        id: id ?? randomUUID(),
        name: settings.name,
        url,
        enabled: settings.enabled ?? old?.enabled ?? true,
        count: old?.count ?? 0,
      };
      if (old && old.url === url) {
        this.db.save("subscription", group.id, { ...old, ...group });
        return this.state();
      }
      return this.replace(group, await this.fetchSources(url));
    });
  }
  refresh(id: string) {
    return this.serialize(async () => {
      const group = this.subscription(id);
      try {
        return this.replace(group, await this.fetchSources(group.url!));
      } catch (error) {
        this.db.save("subscription", id, {
          ...group,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }
  deleteSubscription(id: string) {
    return this.serialize(async () => {
      this.subscription(id);
      this.db.transaction(() => {
        for (const source of this.db.list<SourceRecord>("source"))
          if (source.summary.groupId === id) this.db.delete("source", source.summary.id);
        this.db.delete("subscription", id);
      });
      return this.state();
    });
  }
  search(keyword: string, page: number, ids?: string[], signal?: AbortSignal) {
    const state = this.state();
    const selected = ids?.length
      ? [...new Set(ids)]
      : state.sources
          .filter(
            (source) =>
              source.enabled &&
              source.searchSupported &&
              state.subscriptions.some((group) => group.id === source.groupId && group.enabled),
          )
          .map((source) => source.id);
    if (selected.length > 100)
      throw new AppError("VALIDATION_ERROR", "每次最多搜索 100 个书源，请选择部分书源");
    const sources: RegisteredSource[] = selected.map((id) => {
      const row = this.source(id);
      return {
        id,
        source: row.raw,
        supported: row.summary.searchSupported,
        reason: row.summary.searchError,
      };
    });
    return searchAll(sources, keyword, page, {
      timeoutMs: this.timeoutMs,
      concurrency: 3,
      fetcher: this.fetcher,
      signal,
      runSource: async (source, key, page, options) => {
        try {
          return await this.engine.execute<SourceOutcome>(
            "search",
            [source, key, page],
            options.signal,
          );
        } catch (error) {
          return {
            sourceId: source.id,
            sourceName: source.source.bookSourceName,
            status: "error",
            elapsedMs: this.timeoutMs,
            books: [],
            error: {
              code: "SOURCE_ERROR",
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      },
    });
  }
  catalog(sourceId: string, bookUrl: string, signal?: AbortSignal) {
    const source = this.source(sourceId);
    assertDownloadSupported(source.raw);
    return this.engine.execute<Catalog>("catalog", [source.raw, bookUrl], signal);
  }
}
