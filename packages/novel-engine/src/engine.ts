import { buildRequest, fetchHtml } from "./request.js";
import { SourceRules } from "./analyzer.js";
import { withSourceScript, type SourceScript, type RuntimeOptions } from "./script.js";
import { SEARCH_FIELDS } from "./sources.js";
import {
  SourceError,
  type AggregatedBook,
  type RegisteredSource,
  type SearchBook,
  type SourceOutcome,
} from "./types.js";

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
function cleanAuthor(value: string): string {
  return value.replace(/^\s*作\s*者\s*[:：]\s*/, "").trim();
}
function absolute(value: string, base: string): string {
  if (!value) return "";
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function parseSearchHtml(
  source: RegisteredSource,
  html: string,
  responseUrl: string,
  script?: SourceScript,
): SearchBook[] {
  const rules = source.source.ruleSearch!;
  const parser = new SourceRules(html, script, responseUrl);
  const rows = parser.elements(String(rules.bookList));
  if (!rows.length) {
    if (html.trimStart().startsWith("{") || html.trimStart().startsWith("[")) return [];
    const visible = parser.html.$("body").clone();
    visible.find("script,style").remove();
    const text = visible.text().replace(/\s+/g, " ").trim();
    const title = parser.html.$("title").text();
    if (
      /没有找到|未找到|暂无相关|没有搜索到|无搜索结果|找不到您要搜索|共有\s*0\s*条|no results/i.test(
        text,
      )
    )
      return [];
    if (
      /Just a moment|人机验证|安全验证|滑动验证/i.test(title) ||
      /请完成人机验证|验证您是真人|checking your browser/i.test(text)
    )
      throw new SourceError("CHALLENGE", "上游返回验证页，当前版本不启动浏览器");
    // 无列表时仅对简短、明确的搜索提示页推断空结果；未知页面仍报错。
    if (
      /搜索|search/i.test(title) &&
      text.length < 500 &&
      /请输入.*(?:小说|书名|作者).*(?:查找|搜索)/.test(text)
    )
      return [];
    throw new SourceError(
      "PARSE_MISMATCH",
      "未找到搜索列表，可能是跳转页、站点改版或空结果；需要检查原规则",
    );
  }
  const books: SearchBook[] = [];
  const seen = new Set<string>();
  rows.forEach((row) => {
    const values = Object.fromEntries(
      SEARCH_FIELDS.map((field) => [field, parser.string(rules[field] as string | undefined, row)]),
    );
    const name = values.name!.replace(/\s+/g, " ").trim();
    const bookUrl = absolute(values.bookUrl!, responseUrl);
    if (!name || !bookUrl || seen.has(bookUrl)) return;
    seen.add(bookUrl);
    const book: SearchBook = { name, author: cleanAuthor(values.author!), bookUrl };
    for (const field of ["intro", "kind", "lastChapter", "wordCount"] as const)
      if (values[field]) book[field] = values[field];
    const cover = absolute(values.coverUrl!, responseUrl);
    if (cover) book.coverUrl = cover;
    books.push(book);
  });
  if (!books.length)
    throw new SourceError("PARSE_MISMATCH", "列表存在，但书名或详情链接规则未匹配");
  return books;
}

export interface SearchOptions extends RuntimeOptions {
  timeoutMs: number;
  concurrency: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  runSource?: typeof searchOne;
  onProgress?: (progress: {
    totalSources: number;
    completedSources: number;
    elapsedMs: number;
    source?: SourceOutcome;
  }) => void | Promise<void>;
}

export async function searchOne(
  source: RegisteredSource,
  key: string,
  page: number,
  options: Pick<SearchOptions, "timeoutMs" | "signal" | "fetcher" | "host">,
): Promise<SourceOutcome> {
  const started = performance.now();
  const outcome: SourceOutcome = {
    sourceId: source.id,
    sourceName: source.source.bookSourceName,
    status: "ok",
    elapsedMs: 0,
    books: [],
  };
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    signal.throwIfAborted();
    if (!source.supported)
      throw new SourceError("UNSUPPORTED_RULE", source.reason ?? "书源尚未支持");
    await withSourceScript(
      source.source,
      { ...options, signal, bindings: { key, page } },
      async (script) => {
        script.setBindings({ key, page });
        const response = await fetchHtml(
          buildRequest(source.source, key, page, script),
          signal,
          undefined,
          options.fetcher,
          script,
        );
        signal.throwIfAborted();
        outcome.books = parseSearchHtml(source, response.html, response.url, script);
      },
    );
  } catch (error) {
    outcome.status = "error";
    const reason = options.signal?.aborted
      ? new SourceError("CANCELLED", "搜索已取消")
      : timeout.aborted
        ? new SourceError("TIMEOUT", `书源请求超过 ${options.timeoutMs}ms`)
        : error instanceof SourceError
          ? error
          : new SourceError("SOURCE_ERROR", error instanceof Error ? error.message : String(error));
    outcome.error = { code: reason.code, message: reason.message };
  }
  outcome.elapsedMs = Math.round(performance.now() - started);
  return outcome;
}

export function mergeBooks(outcomes: SourceOutcome[]): AggregatedBook[] {
  const groups = new Map<string, AggregatedBook>();
  for (const outcome of outcomes)
    for (const book of outcome.books) {
      // 缺失作者时不能仅凭同名跨源合并，避免把不同作品混在一起。
      const key = book.author
        ? JSON.stringify([normalize(book.name), normalize(book.author)])
        : JSON.stringify([outcome.sourceId, book.bookUrl]);
      const group = groups.get(key) ?? { name: book.name, author: book.author, origins: [] };
      if (!group.origins.some((o) => o.sourceId === outcome.sourceId && o.bookUrl === book.bookUrl))
        group.origins.push({ ...book, sourceId: outcome.sourceId, sourceName: outcome.sourceName });
      groups.set(key, group);
    }
  return [...groups.values()];
}

export async function searchAll(
  sources: RegisteredSource[],
  key: string,
  page: number,
  options: SearchOptions,
) {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16)
    throw new Error("concurrency 必须为 1–16");
  const started = performance.now();
  const outcomes: SourceOutcome[] = new Array(sources.length);
  let cursor = 0;
  let completedSources = 0;
  await options.onProgress?.({ totalSources: sources.length, completedSources, elapsedMs: 0 });
  const worker = async () => {
    while (cursor < sources.length && !options.signal?.aborted) {
      const index = cursor++;
      outcomes[index] = await (options.runSource ?? searchOne)(sources[index]!, key, page, options);
      completedSources++;
      await options.onProgress?.({
        totalSources: sources.length,
        completedSources,
        elapsedMs: Math.round(performance.now() - started),
        source: outcomes[index],
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, sources.length) }, worker));
  const completed = outcomes.filter(Boolean);
  return {
    keyword: key,
    page,
    elapsedMs: Math.round(performance.now() - started),
    cancelled: options.signal?.aborted ?? false,
    totalSources: sources.length,
    completedSources: completed.length,
    results: mergeBooks(completed),
    sources: completed,
  };
}
