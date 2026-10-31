import { createHash } from "node:crypto";
import { buildRequest } from "./request.js";
import { validateRule } from "./rules.js";
import type { BookSource, RegisteredSource } from "./types.js";
import { SourceError } from "./types.js";

export const SEARCH_FIELDS = [
  "name",
  "author",
  "bookUrl",
  "coverUrl",
  "intro",
  "kind",
  "lastChapter",
  "wordCount",
] as const;

export function assertSupported(source: BookSource): void {
  if ((source.bookSourceType ?? 0) !== 0)
    throw new SourceError("UNSUPPORTED_RULE", "当前版本仅支持文本书源");
  for (const field of [
    "jsLib",
    "loginUrl",
    "loginUi",
    "loginCheckJs",
    "mainJs",
    "concurrentRate",
  ] as const) {
    if (source[field])
      throw new SourceError("UNSUPPORTED_RULE", `当前版本尚未支持 ${field}，不静默忽略`);
  }
  if (
    !source.ruleSearch ||
    typeof source.ruleSearch.bookList !== "string" ||
    !source.ruleSearch.bookList.trim()
  )
    throw new SourceError("UNSUPPORTED_RULE", "缺少搜索列表规则");
  for (const field of ["name", "bookUrl"])
    if (typeof source.ruleSearch[field] !== "string" || !source.ruleSearch[field])
      throw new SourceError("UNSUPPORTED_RULE", `缺少 ${field} 规则`);
  const knownFields = new Set(["bookList", "checkKeyWord", ...SEARCH_FIELDS]);
  for (const [key, value] of Object.entries(source.ruleSearch)) {
    if (!value) continue;
    if (!knownFields.has(key)) throw new SourceError("UNSUPPORTED_RULE", `不支持搜索字段：${key}`);
    if (typeof value !== "string")
      throw new SourceError("UNSUPPORTED_RULE", `搜索规则 ${key} 必须是字符串`);
    if (key !== "checkKeyWord") validateRule(value, key === "bookList" ? "elements" : "string");
  }
  buildRequest(source, "检查", 1);
}

export function registerSources(sources: BookSource[]): RegisteredSource[] {
  const seen = new Set<string>();
  return sources.map((source) => {
    // URL 作为稳定身份；不同规则版本需由用户选择，不隐式覆盖。
    const id = createHash("sha256").update(source.bookSourceUrl).digest("hex").slice(0, 16);
    if (seen.has(id))
      throw new SourceError("UNSUPPORTED_RULE", `重复书源地址：${source.bookSourceUrl}`);
    seen.add(id);
    try {
      assertSupported(source);
      return { id, source, supported: true };
    } catch (error) {
      return {
        id,
        source,
        supported: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export function parseSources(input: unknown): BookSource[] {
  const values = Array.isArray(input) ? input : [input];
  if (!values.length || values.length > 2000)
    throw new SourceError("UNSUPPORTED_RULE", "需要 1–2000 条书源 JSON");
  for (const value of values) {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.bookSourceUrl !== "string" ||
      typeof value.bookSourceName !== "string" ||
      !value.bookSourceName.trim()
    )
      throw new SourceError("UNSUPPORTED_RULE", "每条书源必须包含 bookSourceUrl 和 bookSourceName");
    let url: URL;
    try {
      url = new URL(value.bookSourceUrl);
    } catch {
      throw new SourceError("UNSUPPORTED_RULE", "书源地址无效");
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new SourceError("UNSUPPORTED_RULE", "书源地址必须是 HTTP/HTTPS");
  }
  registerSources(values as BookSource[]);
  return structuredClone(values) as BookSource[];
}
