import JSON5 from "json5";
import iconv from "iconv-lite";
import type { BookSource } from "./types.js";
import { SourceError } from "./types.js";
import { scriptCode, type SourceScript } from "./script.js";

interface Options {
  method?: string;
  body?: string | object;
  headers?: Record<string, string>;
  charset?: string;
  [key: string]: unknown;
}
export interface SearchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  charset: string;
  bodyJs?: string;
}
const UA =
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";

function parseObject(value: string): Record<string, unknown> {
  try {
    const result: unknown = JSON5.parse(value);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("需要对象");
    return result as Record<string, unknown>;
  } catch {
    throw new SourceError("UNSUPPORTED_RULE", "请求选项或 header 必须是静态 JSON/JSON5 对象");
  }
}

function interpolate(
  raw: string,
  key: string,
  page: number,
  script?: SourceScript,
  jsonStrings = false,
): string {
  const template = /\{\{\s*(key|page)\s*\}\}/g;
  if (script)
    return raw.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression: string, offset: number) => {
      if (expression.trim() === "key") return key;
      if (expression.trim() === "page") return String(page);
      const value = script.evaluate(expression);
      if (jsonStrings && typeof value === "string") {
        let quoted = false;
        for (let index = 0; index < offset; index++) {
          if (raw[index] === "\\") index++;
          else if (raw[index] === '"') quoted = !quoted;
        }
        if (quoted) return JSON.stringify(value).slice(1, -1);
      }
      return typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    });
  if (/\{\{|@js:|<js>/i.test(raw.replace(template, "")))
    throw new SourceError("UNSUPPORTED_RULE", "仅支持 {{key}} 和 {{page}} 模板，不执行 JS");
  const value = raw.replace(template, (_, name: string) => (name === "key" ? key : String(page)));
  return value;
}

function encode(value: string, charset: string): string {
  if (/^utf-?8$/i.test(charset)) return encodeURIComponent(value);
  return [...iconv.encode(value, charset)]
    .map((b) =>
      /[A-Za-z0-9_.~-]/.test(String.fromCharCode(b))
        ? String.fromCharCode(b)
        : `%${b.toString(16).padStart(2, "0").toUpperCase()}`,
    )
    .join("");
}

function encodeFields(value: string, charset: string): string {
  // 已有百分号编码和表单中的 + 保持原意，其余内容按字段编码，避免静态中文落入 UTF-8。
  const component = (raw: string) =>
    raw
      .split(/(%[\da-f]{2}|\+)/gi)
      .map((part) => (/^(?:%[\da-f]{2}|\+)$/i.test(part) ? part : encode(part, charset)))
      .join("");
  return value
    .split("&")
    .map((field) => {
      const equal = field.indexOf("=");
      return equal < 0
        ? component(field)
        : `${component(field.slice(0, equal))}=${component(field.slice(equal + 1))}`;
    })
    .join("&");
}

export function buildRequest(
  source: BookSource,
  key: string,
  page: number,
  script?: SourceScript,
): SearchRequest {
  let rawUrl = source.searchUrl?.trim() ?? "";
  const code = scriptCode(rawUrl);
  if (code !== undefined) {
    if (!script) throw new SourceError("UNSUPPORTED_RULE", "脚本 URL 需要书源上下文");
    rawUrl = String(script.evaluate(code) ?? "");
  }
  if (!rawUrl) throw new SourceError("UNSUPPORTED_RULE", "书源缺少 searchUrl");
  const match = /,\s*\{(?!\{)/.exec(rawUrl);
  const options: Options = match ? parseObject(rawUrl.slice(match.index + 1)) : {};
  if (match) rawUrl = rawUrl.slice(0, match.index);
  const supported = new Set([
    "method",
    "body",
    "headers",
    "charset",
    ...(script ? ["js", "bodyJs"] : []),
  ]);
  for (const k of Object.keys(options))
    if (!supported.has(k)) throw new SourceError("UNSUPPORTED_RULE", `不支持请求选项：${k}`);
  const charset = options.charset ?? "utf-8";
  if (typeof charset !== "string" || !iconv.encodingExists(charset))
    throw new SourceError("UNSUPPORTED_RULE", "不支持的请求编码");
  const method = String(options.method ?? "GET").toUpperCase();
  if (!["GET", "POST"].includes(method))
    throw new SourceError("UNSUPPORTED_RULE", `不支持请求方法：${method}`);
  let renderedUrl = interpolate(rawUrl, encode(key, charset), page, script)
    .replace(/<([^<>]*)>/g, (_, value: string) => {
      const choices = value.split(",");
      return choices[Math.min(page, choices.length) - 1]!.trim();
    })
    .replace(/\?([^#]*)/, (_, query: string) => `?${encodeFields(query, charset)}`);
  if (typeof options.js === "string" && script)
    renderedUrl = String(script.evaluate(options.js, { result: renderedUrl }));
  const url = new URL(renderedUrl, source.bookSourceUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new SourceError("UNSUPPORTED_RULE", "仅允许 HTTP/HTTPS 书源");
  const headers: Record<string, string> = { "User-Agent": UA };
  const headerCode = source.header && scriptCode(source.header);
  const header = headerCode !== undefined && script ? script.evaluate(headerCode) : source.header;
  const userHeaders = header
    ? typeof header === "object"
      ? (header as Record<string, unknown>)
      : parseObject(interpolate(String(header), key, page, script))
    : {};
  if (
    options.headers !== undefined &&
    (!options.headers || typeof options.headers !== "object" || Array.isArray(options.headers))
  )
    throw new SourceError("UNSUPPORTED_RULE", "headers 必须是对象");
  const loginHeaders =
    script && new URL(script.source.bookSourceUrl).origin === url.origin
      ? script.state.loginHeaders
      : {};
  for (const [name, value] of Object.entries({
    ...userHeaders,
    ...loginHeaders,
    ...options.headers,
  })) {
    if (typeof value !== "string" || /[\r\n]/.test(value))
      throw new SourceError("UNSUPPORTED_RULE", "请求头必须是单行字符串");
    let expanded = interpolate(value, key, page, script);
    try {
      if (/[\r\n]/.test(expanded)) throw new Error("多行请求头");
      expanded = new Headers({ [name]: expanded }).get(name)!;
    } catch {
      throw new SourceError("UNSUPPORTED_RULE", "请求头名称或插值后的值无效");
    }
    const previous = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    if (previous) delete headers[previous];
    headers[name] = expanded;
  }
  let body: Uint8Array | undefined;
  if (options.body !== undefined) {
    if (method === "GET") throw new SourceError("UNSUPPORTED_RULE", "GET 请求不支持 body");
    const objectBody = typeof options.body === "object" && options.body !== null;
    if (!objectBody && typeof options.body !== "string")
      throw new SourceError("UNSUPPORTED_RULE", "body 必须是字符串或对象");
    const contentType =
      Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
    const isJson =
      objectBody ||
      /\b(?:application\/json|[\w.+-]+\/[\w.+-]+\+json)\b/i.test(contentType) ||
      (!contentType &&
        typeof options.body === "string" &&
        (options.body.trimStart().startsWith("{") || options.body.trimStart().startsWith("[")));
    let bodyText: string;
    if (isJson && !objectBody) {
      // JSON 字符串不能做表单编码；先转义关键词，再校验插值后的 JSON，兼容未加引号的页码。
      bodyText = interpolate(
        String(options.body),
        JSON.stringify(key).slice(1, -1),
        page,
        script,
        true,
      );
      try {
        JSON.parse(bodyText);
      } catch {
        throw new SourceError("UNSUPPORTED_RULE", "JSON body 格式无效");
      }
    } else if (objectBody) {
      const replace = (value: unknown): unknown =>
        typeof value === "string"
          ? interpolate(value, key, page, script)
          : Array.isArray(value)
            ? value.map(replace)
            : value && typeof value === "object"
              ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]))
              : value;
      bodyText = JSON.stringify(replace(options.body));
    } else if (!contentType || /^application\/x-www-form-urlencoded\b/i.test(contentType))
      bodyText = encodeFields(
        interpolate(String(options.body), encode(key, charset), page, script),
        charset,
      );
    else bodyText = interpolate(String(options.body), key, page, script);
    body = iconv.encode(bodyText, charset);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type"))
      headers["Content-Type"] = isJson
        ? `application/json; charset=${charset}`
        : "application/x-www-form-urlencoded";
  }
  return {
    url: url.href,
    method,
    headers,
    body,
    charset,
    ...(typeof options.bodyJs === "string" ? { bodyJs: options.bodyJs } : {}),
  };
}

export async function fetchHtml(
  request: SearchRequest,
  signal: AbortSignal,
  maxBytes = 2 * 1024 * 1024,
  fetcher: typeof fetch = fetch,
  script?: SourceScript,
): Promise<{ html: string; url: string }> {
  try {
    const response = await fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body as BodyInit | undefined,
      signal,
      redirect: "follow",
    });
    if (!response.ok && !script?.source.loginCheckJs) {
      await response.body?.cancel();
      throw new SourceError("HTTP_ERROR", `上游返回 HTTP ${response.status}`);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes)
            throw new SourceError("RESPONSE_TOO_LARGE", `响应超过 ${maxBytes} 字节`);
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    const data = Buffer.concat(chunks);
    const contentType = response.headers.get("content-type") ?? "";
    const meta = data.subarray(0, 8192).toString("latin1");
    const charset =
      /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ??
      /<meta[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(meta)?.[1] ??
      request.charset;
    if (!iconv.encodingExists(charset))
      throw new SourceError("SOURCE_ERROR", `响应编码不支持：${charset}`);
    let html = iconv.decode(data, charset);
    if (request.bodyJs && script)
      html = String(
        script.evaluate(request.bodyJs, { result: html, baseUrl: response.url || request.url }),
      );
    let handledError = false;
    if (script?.source.loginCheckJs) {
      const check = scriptCode(script.source.loginCheckJs) ?? script.source.loginCheckJs;
      const checked = script.evaluate(
        `result = {body:()=>${JSON.stringify(html)}, code:()=>${response.status}, url:()=>${JSON.stringify(response.url || request.url)}};\n(() => { const checked = eval(${JSON.stringify(check)}); return checked && typeof checked.body === 'function' ? checked.body() : checked; })()`,
      );
      if (checked === false) throw new SourceError("SOURCE_ERROR", "登录校验未通过");
      if (typeof checked === "string") {
        handledError = checked !== html;
        html = checked;
      }
    }
    if (!response.ok && !handledError)
      throw new SourceError("HTTP_ERROR", `上游返回 HTTP ${response.status}`);
    return { html, url: response.url || request.url };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (signal.aborted) throw new SourceError("TIMEOUT", "书源请求已超时或取消");
    throw new SourceError(
      "SOURCE_ERROR",
      `书源网络请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
