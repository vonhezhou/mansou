import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { types } from "node:util";
import { checkSourceAccess } from "./sourcePatches.js";
import { compute } from "../../executors/compute.js";
import type { RuntimeOptions } from "../../options.js";
import { SourceDataStore } from "../../host/dataStore.js";

import { SourceCookieStore } from "../../host/cookieStore.js";

type RequestOptions = {
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
  data?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
  bytes?: boolean;
};

type BytesInput = ArrayBuffer | Uint8Array | number[] | string;

function normalizeHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function appendQuery(url: string, query?: RequestOptions["query"]) {
  if (!query) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

function normalizeRequestOptions(
  options: RequestOptions | Record<string, string> = {},
): RequestOptions {
  const knownKeys = new Set(["headers", "method", "body", "data", "query", "timeout", "bytes"]);
  if (Object.keys(options).some((key) => knownKeys.has(key))) return options as RequestOptions;
  return { headers: options as Record<string, string> };
}

function toBuffer(value: BytesInput): Buffer<ArrayBuffer> {
  if (typeof value === "string") return Buffer.from(value);
  if (types.isAnyArrayBuffer(value)) return Buffer.from(new Uint8Array(value));
  if (ArrayBuffer.isView(value))
    return Buffer.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  return Buffer.from(value);
}

function normalizeBody(body: unknown) {
  if (body == null || typeof body === "string") return body;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body) || Array.isArray(body))
    return toBuffer(body as BytesInput);
  return JSON.stringify(body);
}

function aesAlgorithm(key: BytesInput, mode: "ecb" | "cbc" | "cfb" | "ofb") {
  const size = toBuffer(key).length * 8;
  if (![128, 192, 256].includes(size)) throw new Error(`Invalid AES key length: ${size}`);
  return `aes-${size}-${mode}`;
}

function cryptAes(
  encrypt: boolean,
  mode: "ecb" | "cbc" | "cfb" | "ofb",
  value: BytesInput,
  key: BytesInput,
  iv?: BytesInput,
  blockSize = 16,
) {
  const input = toBuffer(value);
  if (mode === "ecb" || mode === "cbc") {
    const cipher = (encrypt ? crypto.createCipheriv : crypto.createDecipheriv)(
      aesAlgorithm(key, mode),
      toBuffer(key),
      mode === "ecb" ? null : toBuffer(iv ?? []),
    );
    // Dart's BlockCipher does not apply PKCS#7 padding.
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(input), cipher.final()]);
  }
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > 16 || input.length % blockSize) {
    throw new Error("Invalid AES feedback block size or input length");
  }
  let feedback: Buffer = mode === "ofb" ? Buffer.alloc(16) : Buffer.from(toBuffer(iv ?? []));
  if (feedback.length !== 16) throw new Error("Invalid AES IV length");
  const cipher = crypto.createCipheriv(aesAlgorithm(key, "ecb"), toBuffer(key), null);
  cipher.setAutoPadding(false);
  const result = Buffer.alloc(input.length);
  for (let offset = 0; offset < input.length; offset += blockSize) {
    const stream = cipher.update(feedback);
    for (let i = 0; i < blockSize; i++) result[offset + i] = input[offset + i] ^ stream[i];
    const next =
      mode === "ofb"
        ? stream.subarray(0, blockSize)
        : (encrypt ? result : input).subarray(offset, offset + blockSize);
    feedback = Buffer.concat([feedback.subarray(blockSize), next]);
  }
  cipher.final();
  return result;
}

class HtmlElement {
  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly selection: cheerio.Cheerio<unknown>,
  ) {}

  querySelector(selector: string) {
    const found = (
      this.selection as unknown as {
        find: (selector: string) => { first: () => cheerio.Cheerio<unknown>; length: number };
      }
    )
      .find(selector)
      .first();
    return found.length === 0 ? null : new HtmlElement(this.$, found);
  }

  querySelectorAll(selector: string) {
    const self = (this.selection as unknown as { is: (selector: string) => boolean }).is(selector)
      ? [new HtmlElement(this.$, this.selection)]
      : [];
    const found = (
      this.selection as unknown as { find: (selector: string) => cheerio.Cheerio<unknown> }
    ).find(selector);
    return [
      ...self,
      ...found.toArray().map((node) => new HtmlElement(this.$, this.$(node as never))),
    ];
  }

  getElementById(id: string) {
    return this.querySelector(`#${id}`);
  }

  get text() {
    return (this.selection as unknown as { text: () => string }).text();
  }

  get attributes() {
    const node = this.selection.get(0) as { attribs?: Record<string, string> } | undefined;
    return node?.attribs ?? {};
  }

  get children() {
    const children = (
      this.selection as unknown as { children: () => cheerio.Cheerio<unknown> }
    ).children();
    return children.toArray().map((node) => new HtmlElement(this.$, this.$(node as never)));
  }

  get nodes() {
    const node = this.selection.get(0) as { children?: unknown[] } | undefined;
    return (node?.children ?? []).map((child) => new HtmlNode(this.$, child));
  }

  get parent(): HtmlElement | null {
    const parent = (
      this.selection as unknown as { parent: () => cheerio.Cheerio<unknown> }
    ).parent();
    return parent.length === 0 ? null : new HtmlElement(this.$, parent);
  }

  get innerHtml() {
    return (this.selection as unknown as { html: () => string | null }).html() ?? "";
  }

  get classNames() {
    return (this.attributes.class ?? "").split(/\s+/).filter(Boolean);
  }

  get id() {
    return this.attributes.id ?? null;
  }

  get localName() {
    const node = this.selection.get(0) as { tagName?: string; name?: string } | undefined;
    return node?.tagName ?? node?.name ?? "";
  }

  get previousSibling(): HtmlElement | null {
    const sibling = (this.selection as unknown as { prev: () => cheerio.Cheerio<unknown> }).prev();
    return sibling.length === 0 ? null : new HtmlElement(this.$, sibling);
  }

  get nextSibling(): HtmlElement | null {
    const sibling = (this.selection as unknown as { next: () => cheerio.Cheerio<unknown> }).next();
    return sibling.length === 0 ? null : new HtmlElement(this.$, sibling);
  }
}

class HtmlNode {
  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly node: unknown,
  ) {}

  get type() {
    const node = this.node as { type?: string };
    if (node.type === "text" || node.type === "comment") return node.type;
    if (node.type === "tag") return "element";
    if (node.type === "root") return "document";
    return node.type ?? "unknown";
  }

  get text() {
    const node = this.node as { data?: string };
    return node.data ?? this.$(this.node as never).text();
  }

  toElement() {
    return this.type === "element" ? new HtmlElement(this.$, this.$(this.node as never)) : null;
  }
}

class HtmlDocument {
  private readonly $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  querySelector(selector: string) {
    const found = this.$(selector).first();
    return found.length === 0 ? null : new HtmlElement(this.$, found);
  }

  querySelectorAll(selector: string) {
    const found = this.$(selector);
    return found.toArray().map((node) => new HtmlElement(this.$, this.$(node as never)));
  }

  getElementById(id: string) {
    return this.querySelector(`#${id}`);
  }

  dispose() {}
}

type WrappedNode = {
  text: () => string;
  html: () => string | null;
  attr: (name: string) => string | undefined;
  length: number;
  eq: (index: number) => WrappedNode;
  find: (selector: string) => WrappedNode;
  map: (fn: (node: WrappedNode, index: number) => unknown) => unknown[];
  toArray: () => WrappedNode[];
};
export async function createRuntimeApi(
  sourceKey: string,
  dataStore: SourceDataStore,
  cookieStore: SourceCookieStore,
  config: RuntimeOptions,
  fetchWithProxy: typeof fetch,
  track: <T>(promise: Promise<T>) => Promise<T> = (promise) => promise,
) {
  async function performRequest(url: string, options: RequestOptions = {}) {
    const jar = await cookieStore.getJar(sourceKey);
    options = normalizeRequestOptions(options);
    const requestUrl = appendQuery(url.startsWith("//") ? `https:${url}` : url, options.query);
    const headers = new Headers(options.headers ?? {});
    if (!headers.has("user-agent")) {
      headers.set(
        "user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      );
    }
    headers.set("accept-encoding", "identity");
    const cookie = await jar.getCookieString(requestUrl);
    if (cookie) headers.set("cookie", cookie);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeout ?? config.requestTimeoutMs,
    );
    try {
      const body = options.body ?? options.data;
      const response = await fetchWithProxy(requestUrl, {
        method: options.method ?? (body == null ? "GET" : "POST"),
        headers,
        body: normalizeBody(body),
        signal: controller.signal,
        redirect: "follow",
      });

      const setCookies =
        typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
        "function"
          ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
          : response.headers.get("set-cookie")
            ? [response.headers.get("set-cookie") as string]
            : [];
      for (const cookieValue of setCookies) {
        await jar.setCookie(cookieValue, requestUrl);
      }
      await cookieStore.save(sourceKey);

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const text = new TextDecoder().decode(bytes);
      checkSourceAccess(config.originalSourceKey ?? sourceKey, response.status, text);
      return {
        status: response.status,
        statusCode: response.status,
        headers: normalizeHeaders(response.headers),
        data: options.bytes ? Array.from(bytes) : text,
        body: options.bytes ? Array.from(bytes) : text,
        text,
        bytes: Array.from(bytes),
        ok: response.ok,
        url: response.url,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  function request(url: string, options: RequestOptions = {}) {
    return track(performRequest(url, options));
  }

  const Network = {
    request,
    fetch: request,
    fetchBytes: async (
      method: string,
      url: string,
      headers: Record<string, string> = {},
      data?: BytesInput,
    ) => {
      const result = await request(url, { method, headers, data, bytes: true });
      return { ...result, body: Buffer.from(result.bytes), data: Buffer.from(result.bytes) };
    },
    sendRequest: (
      method: string,
      url: string,
      headers: Record<string, string> = {},
      data?: BytesInput,
    ) => request(url, { method, headers, data }),
    get: (url: string, options?: RequestOptions | Record<string, string>) =>
      request(url, { ...normalizeRequestOptions(options), method: "GET" }),
    post: (url: string, options?: RequestOptions | Record<string, string>, data?: BytesInput) =>
      request(url, {
        ...normalizeRequestOptions(options),
        method: "POST",
        data: data ?? normalizeRequestOptions(options).data,
      }),
    put: (url: string, options?: RequestOptions | Record<string, string>, data?: BytesInput) =>
      request(url, {
        ...normalizeRequestOptions(options),
        method: "PUT",
        data: data ?? normalizeRequestOptions(options).data,
      }),
    delete: (url: string, options?: RequestOptions | Record<string, string>) =>
      request(url, { ...normalizeRequestOptions(options), method: "DELETE" }),
    patch: (url: string, options?: RequestOptions | Record<string, string>, data?: BytesInput) =>
      request(url, {
        ...normalizeRequestOptions(options),
        method: "PATCH",
        data: data ?? normalizeRequestOptions(options).data,
      }),
    setCookies: async (url: string, cookies: string[] | Record<string, string>) => {
      const jar = await cookieStore.getJar(sourceKey);
      if (Array.isArray(cookies)) {
        for (const cookie of cookies) await jar.setCookie(cookie, url);
      } else {
        for (const [key, value] of Object.entries(cookies))
          await jar.setCookie(`${key}=${value}`, url);
      }
      await cookieStore.save(sourceKey);
    },
    getCookies: async (url: string) => (await cookieStore.getJar(sourceKey)).getCookies(url),
    deleteCookies: async () => cookieStore.clear(sourceKey),
  };

  const Html = {
    parse: (html: string) => {
      const $ = cheerio.load(html);
      const wrap = (selection: cheerio.Cheerio<unknown>): WrappedNode => {
        const anySelection = selection as unknown as {
          text: () => string;
          html: () => string | null;
          attr: (name: string) => string | undefined;
          length: number;
          eq: (index: number) => cheerio.Cheerio<unknown>;
          find: (selector: string) => cheerio.Cheerio<unknown>;
          toArray: () => unknown[];
        };
        return {
          text: () => anySelection.text(),
          html: () => anySelection.html(),
          attr: (name: string) => anySelection.attr(name),
          length: anySelection.length,
          eq: (index: number) => wrap(anySelection.eq(index)),
          find: (selector: string) => wrap(anySelection.find(selector)),
          map: (fn: (node: WrappedNode, index: number) => unknown) =>
            anySelection.toArray().map((node, index) => fn(wrap($(node as string)), index)),
          toArray: () => anySelection.toArray().map((node) => wrap($(node as string))),
        };
      };
      return Object.assign((selector: string) => wrap($(selector)), { $ });
    },
  };

  const Data = {
    load: (key: string) => dataStore.load(sourceKey, key),
    save: (key: string, value: unknown) => dataStore.save(sourceKey, key, value),
    delete: (key: string) => dataStore.delete(sourceKey, key),
    loadData: (key: string) => dataStore.load(sourceKey, key),
    saveData: (key: string, value: unknown) => dataStore.save(sourceKey, key, value),
    deleteData: (key: string) => dataStore.delete(sourceKey, key),
  };

  const Log = {
    info: (...args: unknown[]) => console.info(`[${sourceKey}]`, ...args),
    warning: (...args: unknown[]) => console.warn(`[${sourceKey}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${sourceKey}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${sourceKey}]`, ...args),
  };

  const App = {
    version: config.appVersion,
    locale: config.locale,
    platform: process.platform,
  };

  const Convert = {
    encodeUtf8: (value: string) => Buffer.from(value, "utf8"),
    decodeUtf8: (value: Uint8Array | number[] | string) =>
      Buffer.from(value as string | Uint8Array).toString("utf8"),
    encodeBase64: (value: Uint8Array | number[] | string) =>
      Buffer.from(value as string | Uint8Array).toString("base64"),
    decodeBase64: (value: string) => Buffer.from(value, "base64"),
    md5: (value: BytesInput) => crypto.createHash("md5").update(toBuffer(value)).digest(),
    sha1: (value: BytesInput) => crypto.createHash("sha1").update(toBuffer(value)).digest(),
    sha256: (value: BytesInput) => crypto.createHash("sha256").update(toBuffer(value)).digest(),
    sha512: (value: BytesInput) => crypto.createHash("sha512").update(toBuffer(value)).digest(),
    hmac: (key: BytesInput, value: BytesInput, algorithm = "sha256") =>
      crypto.createHmac(algorithm, toBuffer(key)).update(toBuffer(value)).digest(),
    hmacString: (key: BytesInput, value: BytesInput, algorithm = "sha256") =>
      crypto.createHmac(algorithm, toBuffer(key)).update(toBuffer(value)).digest("hex"),
    hexEncode: (value: Uint8Array | number[] | string) =>
      Buffer.from(value as string | Uint8Array).toString("hex"),
    hexDecode: (value: string) => Buffer.from(value, "hex"),
    encryptAesEcb: (value: BytesInput, key: BytesInput) => cryptAes(true, "ecb", value, key),
    decryptAesEcb: (value: BytesInput, key: BytesInput) => cryptAes(false, "ecb", value, key),
    encryptAesCbc: (value: BytesInput, key: BytesInput, iv: BytesInput) =>
      cryptAes(true, "cbc", value, key, iv),
    decryptAesCbc: (value: BytesInput, key: BytesInput, iv: BytesInput) =>
      cryptAes(false, "cbc", value, key, iv),
    encryptAesCfb: (value: BytesInput, key: BytesInput, iv: BytesInput, blockSize = 16) =>
      cryptAes(true, "cfb", value, key, iv, blockSize),
    decryptAesCfb: (value: BytesInput, key: BytesInput, iv: BytesInput, blockSize = 16) =>
      cryptAes(false, "cfb", value, key, iv, blockSize),
    encryptAesOfb: (value: BytesInput, key: BytesInput, blockSize = 16) =>
      cryptAes(true, "ofb", value, key, undefined, blockSize),
    decryptAesOfb: (value: BytesInput, key: BytesInput, blockSize = 16) =>
      cryptAes(false, "ofb", value, key, undefined, blockSize),
    decryptRsa: (value: BytesInput, key: BytesInput) =>
      crypto.privateDecrypt(toBuffer(key), toBuffer(value)),
  };

  return {
    compute: (func: string, ...args: unknown[]) => compute(sourceKey, func, args, config),
    Network,
    Http: Network,
    HTML: Html,
    Html,
    HtmlDocument,
    Data,
    Storage: Data,
    Log,
    Console: Log,
    App,
    APP: App,
    app: App,
    Convert,
    appVersion: config.appVersion,
  };
}
