import { CookieJar } from "tough-cookie";
import { emptySession, SourceError, type SessionState } from "@mansou/novel-engine";
import type { StorageDatabase } from "@mansou/storage";

/** 会话不进入书源列表、规则导出或任务快照；每次写入都基于最新状态合并。 */
export class NovelSessionStore {
  private memory = new Map<string, SessionState>();
  private versions = new Map<string, number>();
  constructor(private readonly storage?: StorageDatabase["novels"]) {}
  version(id: string) {
    return this.versions.get(id) ?? 0;
  }
  check(id: string, version: number) {
    if (this.version(id) !== version) throw new SourceError("CANCELLED", "书源会话已清除");
  }
  get(id: string): SessionState {
    return this.storage?.get<SessionState>("session", id) ?? this.memory.get(id) ?? emptySession();
  }
  private save(id: string, state: SessionState) {
    if (Buffer.byteLength(JSON.stringify(state)) > 256 * 1024)
      throw new SourceError("RESPONSE_TOO_LARGE", "书源会话超过 256 KiB");
    if (this.storage) this.storage.save("session", id, state);
    else this.memory.set(id, state);
  }
  clear(id: string) {
    this.versions.set(id, this.version(id) + 1);
    this.memory.delete(id);
    this.storage?.delete("session", id);
  }
  loggedIn(id: string, version: number) {
    this.check(id, version);
    this.save(id, { ...this.get(id), loggedIn: true });
  }
  call(id: string, version: number, method: string, args: unknown[]): unknown {
    this.check(id, version);
    const state = this.get(id);
    if (method === "state.get") return state;
    if (method === "state.put") {
      const key = String(args[0]),
        value = String(args[1] ?? "");
      this.save(id, { ...state, data: { ...state.data, [key]: value } });
    } else if (method === "state.headers") {
      const headers = new Headers(args[0] as HeadersInit);
      this.save(id, { ...state, loginHeaders: Object.fromEntries(headers) });
    } else if (method.startsWith("cookie.")) {
      const url = new URL(String(args[0]));
      if (!/^https?:$/.test(url.protocol))
        throw new SourceError("UNSUPPORTED_RULE", "Cookie 仅支持 HTTP/HTTPS");
      const jar = state.cookies ? CookieJar.deserializeSync(state.cookies) : new CookieJar();
      if (method === "cookie.getCookie") return jar.getCookieStringSync(url.href);
      if (method === "cookie.removeCookie") {
        const snapshot = jar.serializeSync();
        if (!snapshot) throw new SourceError("SOURCE_ERROR", "Cookie 会话序列化失败");
        snapshot.cookies = snapshot.cookies.filter((cookie) => {
          const domain = typeof cookie.domain === "string" ? cookie.domain.replace(/^\./, "") : "";
          return cookie.hostOnly
            ? url.hostname !== domain
            : url.hostname !== domain && !url.hostname.endsWith(`.${domain}`);
        });
        this.save(id, { ...state, cookies: snapshot });
        return null;
      } else jar.setCookieSync(String(args[1]), url.href);
      this.save(id, { ...state, cookies: jar.serializeSync() });
    } else throw new SourceError("UNSUPPORTED_RULE", `未知会话操作：${method}`);
    return null;
  }
  cookies(id: string, version: number, url: string): string {
    return this.call(id, version, "cookie.getCookie", [url]) as string;
  }
  receive(id: string, version: number, url: string, values: string[]) {
    this.check(id, version);
    if (!values.length) return;
    const state = this.get(id);
    const jar = state.cookies ? CookieJar.deserializeSync(state.cookies) : new CookieJar();
    for (const cookie of values) jar.setCookieSync(cookie, url, { ignoreError: true });
    this.save(id, { ...state, cookies: jar.serializeSync() });
  }
}
