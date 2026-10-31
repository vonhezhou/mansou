import { HtmlRules } from "./rules.js";
import { validateRule } from "./rules.js";
import { buildRequest, fetchHtml } from "./request.js";
import { SourceError, type BookSource } from "./types.js";
import { assertNoWebView } from "./sources.js";

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
  assertNoWebView(source);
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
  return {
    ...response,
    url: urlOf(response.url || request.url, request.url),
    parser: new HtmlRules(response.html),
  };
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
  let tocUrl = info.tocUrl
    ? links(detail.parser.string(info.tocUrl, detailRoot), detail.url)[0]
    : detail.url;
  if (!tocUrl) throw new SourceError("PARSE_MISMATCH", "目录链接未匹配");
  const queue = [tocUrl];
  const visited = new Set<string>();
  let tocPages = 0;
  const chapters: Chapter[] = [];
  const known = new Set<string>();
  const listRule = toc.chapterList!.replace(/^[+-]/, "");
  while (queue.length && tocPages < maxTocPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    tocPages++;
    const page = url === detail.url ? detail : await load(url, detail.url);
    const alreadyVisited = visited.has(page.url);
    visited.add(url);
    visited.add(page.url);
    if (tocPages === 1) tocUrl = page.url;
    if (alreadyVisited) continue;
    const rows = page.parser.elements(listRule);
    if (!rows.length) throw new SourceError("PARSE_MISMATCH", `目录列表未匹配：${url}`);
    rows.each((index, row) => {
      const title = page.parser.string(toc.chapterName, row);
      const link = links(page.parser.string(toc.chapterUrl, row), page.url)[0];
      // 表格目录可能用纯空白单元格补齐列数；只跳过没有任何条目信息的占位。
      const element = page.parser.$(row);
      if (
        !title &&
        !link &&
        !element.text().trim() &&
        !element.children().length &&
        !element.attr("href")
      )
        return;
      // 不能把部分条目解析成功当作完整目录，避免下载静默缺章。
      if (!title || !link)
        throw new SourceError(
          "PARSE_MISMATCH",
          `目录第 ${index + 1} 项缺少${!title ? "标题" : "链接"}：${page.url}`,
        );
      if (known.has(link)) return;
      if (chapters.length >= 50000)
        throw new SourceError("RESPONSE_TOO_LARGE", "目录超过 50000 章");
      known.add(link);
      chapters.push({ title, url: link });
    });
    if (toc.nextTocUrl)
      for (const next of links(
        page.parser.string(toc.nextTocUrl, page.parser.$.root()[0]!),
        page.url,
      ))
        if (!visited.has(next) && !queue.includes(next)) queue.push(next);
  }
  const tocComplete = queue.every((url) => visited.has(url));
  if (!chapters.length) throw new SourceError("PARSE_MISMATCH", "目录未提取到有效章节");
  if (toc.chapterList!.startsWith("-")) chapters.reverse();
  return { bookUrl: detail.url, tocUrl, tocComplete, tocPages, chapters };
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
  const boundaries = new Set([
    ...catalog.chapters.map((chapter) => urlOf(chapter.url, catalog.bookUrl)),
    urlOf(catalog.tocUrl, catalog.bookUrl),
    urlOf(catalog.bookUrl, catalog.bookUrl),
  ]);
  const seenPages = new Set<string>();
  const bodies: string[] = [];
  const queue = [{ url: urlOf(chapter.url, catalog.bookUrl), follow: true }];
  let pageCount = 0;
  let bytes = 0;
  while (queue.length) {
    const { url: current, follow } = queue.shift()!;
    if (seenPages.has(current)) {
      if (!follow) continue;
      throw new SourceError("SOURCE_ERROR", "正文分页循环");
    }
    if (pageCount >= maxContentPages) throw new SourceError("SOURCE_ERROR", "正文分页超出限制");
    pageCount++;
    const page = await loadPage(source, current, catalog.bookUrl, options);
    // 分页别名可能重定向回已读页或下一章，必须在拼接正文前检查最终地址。
    if (seenPages.has(page.url)) {
      seenPages.add(current);
      if (!follow) continue;
      throw new SourceError("SOURCE_ERROR", "正文分页循环");
    }
    if (bodies.length && boundaries.has(page.url)) continue;
    seenPages.add(current);
    seenPages.add(page.url);
    let body = page.parser.string(content.content, page.parser.$.root()[0]!);
    if (content.replaceRegex) body = page.parser.replace(content.replaceRegex, body);
    body = plainText(body);
    if (!body || (body.length < 200 && /章节加载失败|请开启JavaScript|正在加载正文/.test(body)))
      throw new SourceError("PARSE_MISMATCH", `正文为空或未加载：${current}`);
    bytes += Buffer.byteLength(body) + (bodies.length ? 1 : 0);
    if (bytes > 4 * 1024 * 1024) throw new SourceError("RESPONSE_TOO_LARGE", "单章正文超过 4 MiB");
    bodies.push(body);
    if (!follow || !content.nextContentUrl) continue;
    const next = [
      ...new Set(
        links(page.parser.string(content.nextContentUrl, page.parser.$.root()[0]!), page.url),
      ),
    ];
    // 多链接代表本章的分页列表，按规则顺序读取一次；子页导航不再递归，避免往返。
    const listed = next.length > 1;
    for (const url of next) {
      if (seenPages.has(url)) {
        if (!listed) throw new SourceError("SOURCE_ERROR", "正文分页循环");
        continue;
      }
      if (!boundaries.has(url)) queue.push({ url, follow: !listed });
    }
  }
  return bodies.join("\n");
}
