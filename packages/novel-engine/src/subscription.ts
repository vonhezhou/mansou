import { HtmlRules } from "./rules.js";
import { buildRequest, fetchHtml } from "./request.js";
import { parseSources } from "./sources.js";
import { SourceError, type BookSource } from "./types.js";

export const MIAOGONGZI_SUBSCRIPTION_URL = "http://yuedu.miaogongzi.net/shuyuan/miaogongziDY.json";

export interface SubscriptionResult {
  sources: BookSource[];
  warning?: string;
}

function httpUrl(value: string, base?: string): string {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new SourceError("UNSUPPORTED_RULE", "订阅或合集地址无效");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new SourceError("UNSUPPORTED_RULE", "订阅需要不含凭据的 HTTP/HTTPS 地址");
  return url.href;
}

function collectionUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (
    url.protocol === "yuedu:" &&
    url.hostname === "booksource" &&
    url.pathname === "/importonline"
  ) {
    const source = url.searchParams.get("src");
    if (!source) throw new SourceError("UNSUPPORTED_RULE", "阅读导入链接缺少 src");
    return httpUrl(source, base);
  }
  return httpUrl(value, base);
}

/** RSS 仅用于发现静态合集，不执行 enableJs、网页脚本或 WebView。 */
export async function fetchSubscription(
  url: string,
  options: { fetcher?: typeof fetch; timeoutMs: number },
): Promise<SubscriptionResult> {
  const load = async (url: string, header?: string) => {
    const request = buildRequest(
      { bookSourceName: "订阅", bookSourceUrl: url, searchUrl: url, header },
      "",
      1,
    );
    return fetchHtml(
      request,
      AbortSignal.timeout(options.timeoutMs),
      8 * 1024 * 1024,
      options.fetcher,
    );
  };
  const response = await load(httpUrl(url));
  let input: unknown;
  try {
    input = JSON.parse(response.html);
  } catch {
    throw new SourceError("UNSUPPORTED_RULE", "订阅未返回书源或 RSS 配置 JSON");
  }
  const values = Array.isArray(input) ? input : [input];
  if (
    !values.length ||
    !values.every(
      (item) =>
        item && typeof item === "object" && "sourceUrl" in item && !("bookSourceUrl" in item),
    )
  )
    return { sources: parseSources(input) };
  if (values.length > 10)
    throw new SourceError("UNSUPPORTED_RULE", "每个订阅最多解析 10 个 RSS 管理页");

  const links = new Set<string>();
  for (const rss of values) {
    for (const field of ["sourceUrl", "ruleArticles", "ruleLink"])
      if (typeof rss[field] !== "string" || !rss[field].trim())
        throw new SourceError("UNSUPPORTED_RULE", `RSS 配置缺少 ${field}`);
    if (rss.loginUrl || rss.loginUi || rss.loginCheckJs || rss.jsLib)
      throw new SourceError("UNSUPPORTED_RULE", "RSS 登录或脚本依赖尚不支持");
    const pageUrl = httpUrl(rss.sourceUrl, response.url);
    const page = await load(pageUrl, rss.header);
    const parser = new HtmlRules(page.html);
    const rows = parser.elements(rss.ruleArticles);
    rows.each((_, row) => {
      const value = parser.string(rss.ruleLink, row);
      for (const link of value.split("\n").filter(Boolean))
        links.add(collectionUrl(link, page.url));
    });
    // 喵公子旧 RSS 的 h3 规则已失效；新版页面仍提供明确的阅读书源导入链接。
    if (!rows.length && new URL(pageUrl).hostname === "yuedu.miaogongzi.net")
      parser.$('a[href^="yuedu://booksource/importonline?"]').each((_, row) => {
        links.add(collectionUrl(parser.$(row).attr("href")!, page.url));
      });
  }
  if (!links.size || links.size > 20)
    throw new SourceError("UNSUPPORTED_RULE", "管理页需匹配 1–20 个静态书源合集链接");

  const sources = new Map<string, BookSource>();
  let failed = 0,
    invalid = 0;
  // 合集顺序确定，同地址采用页面中首个版本；单个合集失败不覆盖其他合集。
  for (const link of links) {
    try {
      const result = await load(link);
      const input: unknown = JSON.parse(result.html);
      const rows = Array.isArray(input) ? input : [input];
      if (!rows.length || rows.length > 2000) throw new Error("合集数量越界");
      for (const row of rows) {
        let source: BookSource;
        try {
          [source] = parseSources(row);
        } catch {
          invalid++;
          continue;
        }
        if (!sources.has(source.bookSourceUrl)) sources.set(source.bookSourceUrl, source);
        if (sources.size > 2000)
          throw new SourceError("RESPONSE_TOO_LARGE", "订阅合并后超过 2000 个书源");
      }
    } catch (error) {
      if (error instanceof SourceError && error.code === "RESPONSE_TOO_LARGE") throw error;
      failed++;
    }
  }
  if (!sources.size)
    throw new SourceError(
      "SOURCE_ERROR",
      `未获取有效书源：${failed} 个合集失败，${invalid} 条格式不支持`,
    );
  // 已导入的源由调用方合并保留，避免部分上游故障误删旧规则。
  return {
    sources: [...sources.values()],
    warning:
      failed || invalid
        ? `${failed} 个合集获取失败，${invalid} 条书源格式不支持；已保留未更新的旧规则`
        : undefined,
  };
}
