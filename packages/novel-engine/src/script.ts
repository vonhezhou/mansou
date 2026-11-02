import { getQuickJS, type QuickJSContext, type QuickJSRuntime } from "quickjs-emscripten";
import { createHash, createCipheriv, createDecipheriv } from "node:crypto";
import iconv from "iconv-lite";
import type { SerializedCookieJar } from "tough-cookie";
import { buildRequest, fetchHtml } from "./request.js";
import JSON5 from "json5";
import { SourceError, type BookSource } from "./types.js";

export type RuntimeHost = (method: string, args: unknown[]) => unknown;
export interface RuntimeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  host?: RuntimeHost;
  fetcher?: typeof fetch;
  bindings?: Record<string, unknown>;
}
export interface SessionState {
  data: Record<string, string>;
  loginHeaders: Record<string, string>;
  loggedIn: boolean;
  cookies?: SerializedCookieJar;
}
export const emptySession = (): SessionState => ({ data: {}, loginHeaders: {}, loggedIn: false });

/** 只通过 JSON 值桥接宿主，不能把 Node 对象或函数交给书源脚本。 */
export class SourceScript {
  private readonly runtime: QuickJSRuntime;
  private readonly context: QuickJSContext;
  private deadline: number;
  private local = emptySession();
  private bindings: Record<string, unknown>;
  private hostError?: SourceError;
  private evaluationDepth = 0;
  private readonly variables = new Map<string, string>();
  analyze?: (kind: string, rule: string, input: unknown) => unknown;
  constructor(
    module: Awaited<ReturnType<typeof getQuickJS>>,
    readonly source: BookSource,
    private readonly options: RuntimeOptions = {},
  ) {
    this.deadline = performance.now() + (options.timeoutMs ?? 8000);
    this.runtime = module.newRuntime();
    this.runtime.setMemoryLimit(32 * 1024 * 1024);
    this.runtime.setMaxStackSize(512 * 1024);
    this.runtime.setInterruptHandler(
      () => Boolean(options.signal?.aborted) || performance.now() > this.deadline,
    );
    this.context = this.runtime.newContext();
    this.bindings = {
      key: "",
      page: 1,
      baseUrl: source.bookSourceUrl,
      book: {},
      chapter: {},
      result: "",
      ...options.bindings,
    };
    const bridge = this.context.newFunction("__host", (method, args) => {
      const started = performance.now();
      try {
        const value = this.dispatch(
          this.context.getString(method),
          JSON.parse(this.context.getString(args)),
        );
        return this.context.newString(JSON.stringify({ ok: true, value: value ?? null }));
      } catch (error) {
        this.hostError = error instanceof SourceError ? error : undefined;
        return this.context.newString(
          JSON.stringify({
            ok: false,
            code: error instanceof SourceError ? error.code : "SOURCE_ERROR",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        this.deadline += performance.now() - started;
      }
    });
    this.context.setProp(this.context.global, "__host", bridge);
    bridge.dispose();
    this.evaluate(
      `
      const call = (name, ...args) => { const r = JSON.parse(__host(name, JSON.stringify(args))); if (!r.ok) { const e = new Error(r.message); e.code = r.code; throw e; } return r.value; };
      const missing = name => { const e = new Error('尚未实现宿主接口：' + name); e.code = 'UNSUPPORTED_RULE'; throw e; };
      const hostObject = (prefix, methods) => new Proxy(Object.fromEntries(methods.map(name => [name, (...args) => call(prefix + '.' + name, ...args)])), { get(target, name) { if (name in target) return target[name]; if (name === 'then' || name === 'toJSON') return undefined; return () => missing(prefix + '.' + String(name)); } });
      globalThis.java = hostObject('java', ['ajax','connect','get','post','put','getString','getStringList','getElements','base64Encode','base64Decode','hexEncode','hexDecode','md5Encode','md5Encode16','sha256Encode','encodeURI','decodeURI','timeFormat','aesEncodeToBase64','aesDecodeToString']);
      globalThis.source = hostObject('source', ['get','put','getKey','getTag','getVariable','setVariable','getLoginInfo','getLoginInfoMap','getLoginHeader','putLoginHeader','removeLoginHeader']);
      source.getLoginInfoMap = () => { const map = call('source.getLoginInfoMap'); Object.defineProperty(map, 'get', {value:key=>map[key]}); return map; };
      globalThis.cookie = hostObject('cookie', ['getCookie','setCookie','removeCookie']);
      globalThis.cache = hostObject('cache', ['get','put','delete']);
      globalThis.console = { log(){}, warn(){}, error(){} };
      const wrapResponse = r => ({ body: () => r.body, code: () => r.status, url: () => r.url, header: name => r.headers[String(name).toLowerCase()] ?? null });
      java.connect = (...args) => wrapResponse(call('java.connect', ...args));
      java.get = (...args) => args.length === 1 ? call('variable.get', ...args) : wrapResponse(call('java.get', ...args));
      java.post = (...args) => wrapResponse(call('java.post', ...args));
      java.put = (key, value) => call('variable.put', key, value);
      java.getString = (rule, input) => call('rule.string', rule, input === undefined ? result : input);
      java.getStringList = (rule, input) => call('rule.list', rule, input === undefined ? result : input);
      java.getElements = (rule, input) => call('rule.elements', rule, input === undefined ? result : input);
    `,
      {},
      false,
    );
  }
  setBindings(values: Record<string, unknown>) {
    Object.assign(this.bindings, values);
  }
  private variableKey(name: string): string | undefined {
    const book = this.bindings.book as { bookUrl?: string } | undefined;
    return book?.bookUrl ? `__book:${JSON.stringify([book.bookUrl, name])}` : undefined;
  }
  getVariable(name: string): string {
    const key = this.variableKey(name);
    return key ? (this.state.data[key] ?? "") : (this.variables.get(name) ?? "");
  }
  putVariable(name: string, value: string) {
    const key = this.variableKey(name);
    if (key) this.update("state.put", [key, value]);
    else this.variables.set(name, value);
  }
  get state(): SessionState {
    return this.options.host ? (this.options.host("state.get", []) as SessionState) : this.local;
  }
  private update(method: string, args: unknown[]) {
    if (this.options.host) return this.options.host(method, args);
    if (method === "state.put") this.local.data[String(args[0])] = String(args[1]);
    if (method === "state.headers") this.local.loginHeaders = args[0] as Record<string, string>;
    return null;
  }
  private dispatch(method: string, args: unknown[]): unknown {
    const value = String(args[0] ?? ""),
      encoding = String(args[1] ?? "utf8");
    switch (method) {
      case "variable.get":
        return this.getVariable(value);
      case "variable.put":
        this.putVariable(value, String(args[1] ?? ""));
        return null;
      case "rule.string":
      case "rule.list":
      case "rule.elements":
        if (!this.analyze) throw new SourceError("SOURCE_ERROR", "当前没有可分析的响应");
        return this.analyze(method, value, args[1]);
      case "source.getKey":
        return this.source.bookSourceUrl;
      case "source.getTag":
        return this.source.bookSourceName;
      case "source.get":
      case "cache.get":
        return this.state.data[value] ?? "";
      case "source.put":
      case "cache.put":
        return this.update("state.put", args);
      case "cache.delete":
        return this.update("state.put", [value, ""]);
      case "source.getVariable":
        return this.state.data.__variable ?? "";
      case "source.setVariable":
        return this.update("state.put", ["__variable", value]);
      case "source.getLoginInfo":
        return JSON.stringify(this.bindings.loginInfo ?? {});
      case "source.getLoginInfoMap":
        return this.bindings.loginInfo ?? {};
      case "source.getLoginHeader":
        return JSON.stringify(this.state.loginHeaders);
      case "source.putLoginHeader": {
        const headers = typeof args[0] === "string" ? JSON.parse(value) : args[0];
        return this.update("state.headers", [headers]);
      }
      case "source.removeLoginHeader":
        this.update("state.headers", [{}]);
        return this.options.host?.("cookie.removeCookie", [this.source.bookSourceUrl]) ?? null;
      case "cookie.getCookie":
      case "cookie.setCookie":
      case "cookie.removeCookie":
        if (!this.options.host)
          throw new SourceError("UNSUPPORTED_RULE", "Cookie 操作需要书源会话宿主");
        return this.options.host(method, args);
      case "java.ajax":
      case "java.connect":
      case "java.get":
      case "java.post": {
        if (!this.options.host)
          throw new SourceError("UNSUPPORTED_RULE", "同步网络调用需要 Worker 网络宿主");
        let url = value;
        if (method === "java.post")
          url += `,${JSON.stringify({ method: "POST", body: args[1], headers: args[2] ?? {} })}`;
        const extra = method === "java.connect" || method === "java.get" ? args[1] : undefined;
        const headers = typeof extra === "string" ? JSON.parse(extra) : (extra ?? {});
        const request = buildRequest(
          {
            ...this.source,
            bookSourceUrl: String(this.bindings.baseUrl),
            header: JSON.stringify(headers),
            searchUrl: url,
          },
          "",
          1,
          this,
        );
        const response = this.options.host("http", [request]) as {
          body: string;
          bodyBase64?: string;
          headers: Record<string, string>;
        };
        if (response.bodyBase64 !== undefined) {
          const charset =
            /charset\s*=\s*["']?([\w-]+)/i.exec(response.headers["content-type"] ?? "")?.[1] ??
            request.charset;
          response.body = iconv.decode(Buffer.from(response.bodyBase64, "base64"), charset);
        }
        return method === "java.ajax" ? response.body : response;
      }
      case "java.base64Encode":
        return iconv.encode(value, encoding).toString("base64");
      case "java.base64Decode":
        return iconv.decode(Buffer.from(value, "base64"), encoding);
      case "java.hexEncode":
        return Buffer.from(value).toString("hex");
      case "java.hexDecode":
        return Buffer.from(value, "hex").toString();
      case "java.md5Encode":
        return createHash("md5").update(value).digest("hex");
      case "java.md5Encode16":
        return createHash("md5").update(value).digest("hex").slice(8, 24);
      case "java.sha256Encode":
        return createHash("sha256").update(value).digest("hex");
      case "java.encodeURI":
        return encodeURIComponent(value);
      case "java.decodeURI":
        return decodeURIComponent(value.replace(/\+/g, " "));
      case "java.aesEncodeToBase64":
      case "java.aesDecodeToString": {
        const transformation = String(args[1] ?? "AES/CBC/PKCS5Padding");
        if (!/^AES\/(CBC|ECB)\/PKCS[57]Padding$/i.test(transformation))
          throw new SourceError("UNSUPPORTED_RULE", "仅支持 AES/CBC、ECB 的 PKCS 填充");
        const key = Buffer.from(String(args[2] ?? "")),
          iv = Buffer.from(String(args[3] ?? ""));
        const mode = transformation.split("/")[1]!.toLowerCase();
        const algorithm = `aes-${key.length * 8}-${mode}`;
        const encrypt = method === "java.aesEncodeToBase64";
        const cipher = encrypt
          ? createCipheriv(algorithm, key, mode === "ecb" ? null : iv)
          : createDecipheriv(algorithm, key, mode === "ecb" ? null : iv);
        return Buffer.concat([
          cipher.update(Buffer.from(value, encrypt ? "utf8" : "base64")),
          cipher.final(),
        ]).toString(encrypt ? "base64" : "utf8");
      }
      default:
        throw new SourceError("UNSUPPORTED_RULE", `尚未实现宿主接口：${method}`);
    }
  }
  /** 脚本结果必须可序列化；Promise 不能被当作普通结果静默接收。 */
  evaluate(code: string, bindings: Record<string, unknown> = {}, expression = true): unknown {
    const nested = this.evaluationDepth++ > 0;
    const previous = nested
      ? ["result", "baseUrl"].map(
          (name) => [name, this.context.getProp(this.context.global, name)] as const,
        )
      : [];
    const deadline = this.deadline;
    const baseUrl = this.bindings.baseUrl;
    try {
      if (typeof bindings.baseUrl === "string") this.bindings.baseUrl = bindings.baseUrl;
      return this.runCode(code, bindings, expression);
    } finally {
      this.evaluationDepth--;
      if (nested) {
        for (const [name, value] of previous) {
          this.context.setProp(this.context.global, name, value);
          value.dispose();
        }
        this.deadline = deadline;
        this.bindings.baseUrl = baseUrl;
      }
    }
  }
  private runCode(code: string, bindings: Record<string, unknown>, expression: boolean): unknown {
    this.options.signal?.throwIfAborted();
    // 每段脚本限制执行时间；同步网络等待单独受主进程请求超时约束，不计入 CPU 时间。
    this.deadline = performance.now() + Math.min(this.options.timeoutMs ?? 1000, 1000);
    const input = JSON.stringify({ ...this.bindings, ...bindings });
    const set = this.context.evalCode(`Object.assign(globalThis, ${input})`);
    if (set.error) {
      const message = this.context.dump(set.error);
      set.error.dispose();
      throw new SourceError("SOURCE_ERROR", String(message));
    }
    set.value.dispose();
    this.hostError = undefined;
    const result = this.context.evalCode(code, "book-source.js", { type: "global" });
    if (result.error) {
      const error = this.context.dump(result.error);
      result.error.dispose();
      if (this.hostError) throw this.hostError;
      const timedOut = this.options.signal?.aborted || performance.now() >= this.deadline;
      throw new SourceError(
        timedOut
          ? "TIMEOUT"
          : error?.code === "UNSUPPORTED_RULE"
            ? "UNSUPPORTED_RULE"
            : "SOURCE_ERROR",
        timedOut ? "书源脚本执行超时" : String(error?.message ?? "书源脚本异常"),
      );
    }
    try {
      if (!expression) return undefined;
      if (
        this.context.typeof(result.value) === "object" &&
        !this.context.eq(result.value, this.context.null)
      ) {
        const then = this.context.getProp(result.value, "then");
        try {
          if (this.context.typeof(then) === "function")
            throw new SourceError("UNSUPPORTED_RULE", "书源规则应同步返回结果");
        } finally {
          then.dispose();
        }
      }
      return this.context.dump(result.value);
    } finally {
      result.value.dispose();
    }
  }
  dispose() {
    this.context.dispose();
    this.runtime.dispose();
  }
}

export async function withSourceScript<T>(
  source: BookSource,
  options: RuntimeOptions,
  work: (script: SourceScript) => Promise<T>,
): Promise<T> {
  const script = new SourceScript(await getQuickJS(), source, options);
  try {
    if (source.jsLib) {
      let libraries = [source.jsLib];
      if (source.jsLib.trimStart().startsWith("{")) {
        const map = JSON5.parse(source.jsLib) as Record<string, unknown>;
        libraries = Object.values(map).filter(
          (value): value is string => typeof value === "string" && /^https?:\/\//i.test(value),
        );
      }
      if (libraries.length > 8)
        throw new SourceError("UNSUPPORTED_RULE", "单个书源最多加载 8 个脚本库");
      for (const library of libraries) {
        let code = library;
        if (/^https?:\/\//i.test(library)) {
          const request = buildRequest(
            { bookSourceName: source.bookSourceName, bookSourceUrl: library, searchUrl: library },
            "",
            1,
          );
          code = (
            await fetchHtml(
              request,
              options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 8000),
              undefined,
              options.fetcher,
            )
          ).html;
        }
        script.evaluate(code, {}, false);
      }
    }
    if (source.mainJs) script.evaluate(source.mainJs, {}, false);
    const login = source.loginUrl && (scriptCode(source.loginUrl) ?? source.loginUrl);
    if (login && /\bfunction\s+login\s*\(/.test(login)) script.evaluate(login, {}, false);
    return await work(script);
  } finally {
    script.dispose();
  }
}

export function scriptCode(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^@js:/i.test(trimmed)) return trimmed.slice(4);
  const match = /^<js>([\s\S]*)<\/js>$/i.exec(trimmed);
  return match?.[1];
}
