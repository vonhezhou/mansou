import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { config } from "../config/config.js";
import { SourceDataStore } from "./dataStore.js";
import { fetchWithProxy } from "../utils/fetch.js";
import { SourceCookieStore } from "./cookieStore.js";

type RequestOptions = {
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
  data?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
  bytes?: boolean;
};

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

function normalizeRequestOptions(options: RequestOptions | Record<string, string> = {}): RequestOptions {
  const knownKeys = new Set(["headers", "method", "body", "data", "query", "timeout", "bytes"]);
  if (Object.keys(options).some((key) => knownKeys.has(key))) return options as RequestOptions;
  return { headers: options as Record<string, string> };
}

export async function createRuntimeApi(sourceKey: string, dataStore: SourceDataStore, cookieStore: SourceCookieStore) {
  const jar = await cookieStore.getJar(sourceKey);

  async function request(url: string, options: RequestOptions = {}) {
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
    const timeout = setTimeout(() => controller.abort(), options.timeout ?? config.requestTimeoutMs);
    try {
      const body = options.body ?? options.data;
      const response = await fetchWithProxy(requestUrl, {
        method: options.method ?? (body == null ? "GET" : "POST"),
        headers,
        body: typeof body === "string" || body == null ? body : JSON.stringify(body),
        signal: controller.signal,
        redirect: "follow",
      });

      const setCookies =
        typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
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

  const Network = {
    request,
    get: (url: string, options?: RequestOptions | Record<string, string>) => request(url, { ...normalizeRequestOptions(options), method: "GET" }),
    post: (url: string, options?: RequestOptions | Record<string, string>) => request(url, { ...normalizeRequestOptions(options), method: "POST" }),
    fetch: request,
    setCookies: async (url: string, cookies: string[] | Record<string, string>) => {
      if (Array.isArray(cookies)) {
        for (const cookie of cookies) await jar.setCookie(cookie, url);
      } else {
        for (const [key, value] of Object.entries(cookies)) await jar.setCookie(`${key}=${value}`, url);
      }
      await cookieStore.save(sourceKey);
    },
    getCookies: async (url: string) => jar.getCookies(url),
    deleteCookies: async () => cookieStore.clear(sourceKey),
  };

  const Html = {
    parse: (html: string) => {
      const $ = cheerio.load(html);
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

  class HtmlElement {
    constructor(private readonly $: cheerio.CheerioAPI, private readonly selection: cheerio.Cheerio<unknown>) {}

    querySelector(selector: string) {
      const found = (this.selection as unknown as { find: (selector: string) => { first: () => cheerio.Cheerio<unknown>; length: number } }).find(selector).first();
      return found.length === 0 ? null : new HtmlElement(this.$, found);
    }

    querySelectorAll(selector: string) {
      const self = (this.selection as unknown as { is: (selector: string) => boolean }).is(selector)
        ? [new HtmlElement(this.$, this.selection)]
        : [];
      const found = (this.selection as unknown as { find: (selector: string) => cheerio.Cheerio<unknown> }).find(selector);
      return [...self, ...found.toArray().map((node) => new HtmlElement(this.$, this.$(node as never)))];
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
      const children = (this.selection as unknown as { children: () => cheerio.Cheerio<unknown> }).children();
      return children.toArray().map((node) => new HtmlElement(this.$, this.$(node as never)));
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

  const Data = {
    load: (key: string) => dataStore.load(sourceKey, key),
    save: (key: string, value: unknown) => dataStore.save(sourceKey, key, value),
    delete: (key: string) => dataStore.delete(sourceKey, key),
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
    decodeUtf8: (value: Uint8Array | number[] | string) => Buffer.from(value as string | Uint8Array).toString("utf8"),
    encodeBase64: (value: Uint8Array | number[] | string) => Buffer.from(value as string | Uint8Array).toString("base64"),
    decodeBase64: (value: string) => Buffer.from(value, "base64"),
    md5: (value: Uint8Array | number[] | string) => crypto.createHash("md5").update(Buffer.from(value as string | Uint8Array)).digest(),
    sha1: (value: Uint8Array | number[] | string) => crypto.createHash("sha1").update(Buffer.from(value as string | Uint8Array)).digest(),
    sha256: (value: Uint8Array | number[] | string) => crypto.createHash("sha256").update(Buffer.from(value as string | Uint8Array)).digest(),
    hmacString: (key: Uint8Array | number[] | string, value: Uint8Array | number[] | string, algorithm = "sha256") =>
      crypto.createHmac(algorithm, Buffer.from(key as string | Uint8Array)).update(Buffer.from(value as string | Uint8Array)).digest("hex"),
    hexEncode: (value: Uint8Array | number[] | string) => Buffer.from(value as string | Uint8Array).toString("hex"),
    hexDecode: (value: string) => Buffer.from(value, "hex"),
    decryptAesEcb: (value: Uint8Array | number[] | string, key: Uint8Array | number[] | string) => {
      const keyBuffer = Buffer.from(key as string | Uint8Array);
      const algorithm = keyBuffer.length === 16 ? "aes-128-ecb" : keyBuffer.length === 24 ? "aes-192-ecb" : "aes-256-ecb";
      const decipher = crypto.createDecipheriv(algorithm, keyBuffer, null);
      return Buffer.concat([decipher.update(Buffer.from(value as string | Uint8Array)), decipher.final()]);
    },
  };

  return { Network, Html, HtmlDocument, Data, Log, App, Convert, appVersion: config.appVersion };
}
