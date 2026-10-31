import { HtmlRules } from "./rules.js";
import { validateRule } from "./rules.js";
import { buildRequest, fetchHtml } from "./request.js";
import { SourceError, type BookSource } from "./types.js";

export interface Chapter {
  title: string;
  url: string;
}
export interface ContentOptions {
  maxTocPages?: number;
  maxContentPages?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}
export interface Catalog {
  bookUrl: string;
  tocUrl: string;
  tocComplete: boolean;
  tocPages: number;
  chapters: Chapter[];
}

function rules(source: BookSource, name: string): Record<string, string> {
  const value = source[name];
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SourceError("UNSUPPORTED_RULE", `缺少 ${name}`);
  const result: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field === null || field === undefined || field === "") continue;
    if (typeof field !== "string")
      throw new SourceError("UNSUPPORTED_RULE", `${name}.${key} 类型不支持`);
    result[key] = field;
  }
  return result;
}

export function assertDownloadSupported(source: BookSource): void {
  if ((source.bookSourceType ?? 0) !== 0)
    throw new SourceError("UNSUPPORTED_RULE", "文本下载 仅支持文本书源");
  for (const field of ["jsLib", "loginUrl", "loginUi", "loginCheckJs", "mainJs", "concurrentRate"])
    if (source[field]) throw new SourceError("UNSUPPORTED_RULE", `下载尚不支持 ${field}`);
  const info = rules(source, "ruleBookInfo");
  const toc = rules(source, "ruleToc");
  const content = rules(source, "ruleContent");
  for (const field of ["init", "tocUrl"])
    if (info[field]) validateRule(info[field], field === "init" ? "elements" : "string");
  for (const field of ["chapterList", "chapterName", "chapterUrl"])
    if (!toc[field]) throw new SourceError("UNSUPPORTED_RULE", `缺少目录规则 ${field}`);
  for (const [key, value] of Object.entries(toc)) {
    if (!["chapterList", "chapterName", "chapterUrl", "nextTocUrl"].includes(key))
      throw new SourceError("UNSUPPORTED_RULE", `目录规则 ${key} 尚未支持`);
    validateRule(
      key === "chapterList" ? value.replace(/^[+-]/, "") : value,
      key === "chapterList" ? "elements" : "string",
    );
  }
  if (!content.content) throw new SourceError("UNSUPPORTED_RULE", "缺少正文规则");
  for (const [key, value] of Object.entries(content)) {
    if (!["content", "title", "nextContentUrl", "replaceRegex"].includes(key))
      throw new SourceError("UNSUPPORTED_RULE", `正文规则 ${key} 尚未支持`);
    validateRule(value, "string");
    if (key === "replaceRegex") new HtmlRules("").replace(value, "");
  }
}

function urlOf(value: string, base: string): string {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol))
    throw new SourceError("UNSUPPORTED_RULE", "下载仅支持 HTTP/HTTPS 地址");
  url.hash = "";
  return url.href;
}
function links(value: string, base: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith("javascript:"))
    .map((s) => urlOf(s, base));
}
function plainText(value: string): string {
  if (/<\/?(?:div|p|br|span|article|section|h[1-6])\b/i.test(value)) {
    const p = new HtmlRules(value);
    p.$("script,style,noscript").remove();
    p.$("br").replaceWith("\n");
    p.$("p,div,section,article,h1,h2,h3").append("\n");
    value = p.$("body").text();
  }
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

async function loadPage(source: BookSource, url: string, base: string, options: ContentOptions) {
  options.signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 8000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const request = buildRequest({ ...source, bookSourceUrl: base, searchUrl: url }, "", 1);
  if (!Object.keys(request.headers).some((k) => k.toLowerCase() === "referer"))
    request.headers.Referer = base;
  const response = await fetchHtml(request, signal, undefined, options.fetcher);
  signal.throwIfAborted();
  return { ...response, parser: new HtmlRules(response.html) };
}

export async function loadCatalog(
  source: BookSource,
  bookUrl: string,
  options: ContentOptions = {},
): Promise<Catalog> {
  assertDownloadSupported(source);
  const maxTocPages = options.maxTocPages ?? 100;
  const info = rules(source, "ruleBookInfo");
  const toc = rules(source, "ruleToc");
  const load = (url: string, base: string) => loadPage(source, url, base, options);
  const detail = await load(bookUrl, source.bookSourceUrl);
  const detailRoot = info.init
    ? detail.parser.elements(info.init).first()[0]
    : detail.parser.$.root()[0];
  if (!detailRoot) throw new SourceError("PARSE_MISMATCH", "详情 init 未匹配");
  const tocUrl = info.tocUrl
    ? links(detail.parser.string(info.tocUrl, detailRoot), detail.url)[0]
    : detail.url;
  if (!tocUrl) throw new SourceError("PARSE_MISMATCH", "目录链接未匹配");
  const queue = [tocUrl];
  const visited = new Set<string>();
  const chapters: Chapter[] = [];
  const known = new Set<string>();
  const listRule = toc.chapterList!.replace(/^[+-]/, "");
  while (queue.length && visited.size < maxTocPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    const page = url === detail.url ? detail : await load(url, detail.url);
    const rows = page.parser.elements(listRule);
    if (!rows.length) throw new SourceError("PARSE_MISMATCH", `目录列表未匹配：${url}`);
    rows.each((_, row) => {
      const title = page.parser.string(toc.chapterName, row);
      const link = links(page.parser.string(toc.chapterUrl, row), page.url)[0];
      if (chapters.length >= 50000)
        throw new SourceError("RESPONSE_TOO_LARGE", "目录超过 50000 章");
      if (title && link && !known.has(link)) {
        known.add(link);
        chapters.push({ title, url: link });
      }
    });
    if (toc.nextTocUrl)
      for (const next of links(
        page.parser.string(toc.nextTocUrl, page.parser.$.root()[0]!),
        page.url,
      ))
        if (!visited.has(next) && !queue.includes(next)) queue.push(next);
  }
  const tocComplete = queue.length === 0;
  if (!chapters.length) throw new SourceError("PARSE_MISMATCH", "目录未提取到有效章节");
  if (toc.chapterList!.startsWith("-")) chapters.reverse();
  return { bookUrl: detail.url, tocUrl, tocComplete, tocPages: visited.size, chapters };
}

export async function loadChapter(
  source: BookSource,
  chapter: Chapter,
  catalog: Catalog,
  options: ContentOptions = {},
): Promise<string> {
  assertDownloadSupported(source);
  const content = rules(source, "ruleContent");
  const maxContentPages = options.maxContentPages ?? 20;
  const known = new Set(catalog.chapters.map((chapter) => chapter.url));
  const seenPages = new Set<string>();
  const bodies: string[] = [];
  let current: string | undefined = chapter.url;
  let bytes = 0;
  while (current) {
    if (seenPages.has(current)) throw new SourceError("SOURCE_ERROR", "正文分页循环");
    if (seenPages.size >= maxContentPages)
      throw new SourceError("SOURCE_ERROR", "正文分页超出限制");
    seenPages.add(current);
    const page = await loadPage(source, current, catalog.bookUrl, options);
    let body = page.parser.string(content.content, page.parser.$.root()[0]!);
    if (content.replaceRegex) body = page.parser.replace(content.replaceRegex, body);
    body = plainText(body);
    if (!body || (body.length < 200 && /章节加载失败|请开启JavaScript|正在加载正文/.test(body)))
      throw new SourceError("PARSE_MISMATCH", `正文为空或未加载：${current}`);
    bytes += Buffer.byteLength(body);
    if (bytes > 4 * 1024 * 1024) throw new SourceError("RESPONSE_TOO_LARGE", "单章正文超过 4 MiB");
    bodies.push(body);
    const next = content.nextContentUrl
      ? links(page.parser.string(content.nextContentUrl, page.parser.$.root()[0]!), page.url)[0]
      : undefined;
    if (next && seenPages.has(next)) throw new SourceError("SOURCE_ERROR", "正文分页循环");
    // 目录中的下一章不是当前章的分页。
    current =
      next && !known.has(next) && next !== catalog.tocUrl && next !== catalog.bookUrl
        ? next
        : undefined;
  }
  return bodies.join("\n");
}
