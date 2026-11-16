import path from "node:path";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import type { SourceFile } from "@mansou/core";
import { SourceError } from "@mansou/novel-engine";
import { NovelSessionStore } from "../../services/novels/sessionStore.js";

export const ZLIBRARY_KEY = "builtin:zlibrary";
export const ZLIBRARY_RULE = {
  bookSourceName: "Z-Library",
  bookSourceUrl: "https://zlib.bz",
  provider: "zlibrary",
};
export const isZlibrary = (raw: Record<string, unknown>) => raw.provider === "zlibrary";

type RawBook = {
  id: string | number;
  hash: string;
  title: string;
  author?: string;
  cover?: string;
  description?: string;
  extension: string;
  filesize?: string | number;
  language?: string;
  publisher?: string;
  year?: string | number;
};
type Envelope = {
  success: number;
  error?: string;
  book?: RawBook;
  books?: RawBook[];
  pagination?: { total_pages: number };
  user?: {
    id: string | number;
    remix_userkey?: string;
    remix_user_key?: string;
    downloads_today?: number;
    downloads_limit?: number;
    dailyDownloadsCount?: number;
    dailyDownloadLimit?: number;
  };
  file?: { downloadLink?: string };
  downloadLink?: string;
  url?: string;
  link?: string;
};
export type ZlibraryBook = SourceFile & {
  id: string;
  title: string;
  author: string;
  cover: string;
  description: string;
};

/** EAPI 协议参考 heartleo/zlib；书籍和漫画共用一个账号会话。 */
export class ZlibraryClient {
  private readonly shutdown = new AbortController();
  close() {
    this.shutdown.abort();
  }
  constructor(
    private readonly fetcher: typeof fetch,
    readonly sessions: NovelSessionStore,
    private readonly origin: () => string,
  ) {}
  domain() {
    const url = new URL(this.origin());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new SourceError("SOURCE_ERROR", "Z-Library 域名必须是 HTTPS 站点地址");
    return url.origin;
  }
  private credentials(version: number) {
    this.sessions.check(ZLIBRARY_KEY, version);
    return this.sessions.get(ZLIBRARY_KEY).loginHeaders;
  }
  private async request(endpoint: string, values?: URLSearchParams, signal?: AbortSignal) {
    signal = signal ? AbortSignal.any([signal, this.shutdown.signal]) : this.shutdown.signal;
    const version = this.sessions.version(ZLIBRARY_KEY);
    const response = await this.fetcher(this.domain() + endpoint, {
      method: values ? "POST" : "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        ...(values ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...this.credentials(version),
      },
      body: values?.toString(),
      redirect: "manual",
      signal,
    });
    // 带会话的 EAPI 请求禁止重定向，避免镜像将凭据转交其他站点。
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new SourceError("HTTP_ERROR", "Z-Library 接口发生重定向，请更新源设置中的域名");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      if (reader)
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.length;
          if (length > 2 * 1024 * 1024)
            throw new SourceError("RESPONSE_TOO_LARGE", "Z-Library 接口响应超过 2 MiB");
          chunks.push(chunk.value);
        }
    } finally {
      await reader?.cancel();
    }
    signal?.throwIfAborted();
    this.sessions.check(ZLIBRARY_KEY, version);
    let data: Envelope;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new SourceError("CHALLENGE", "Z-Library 未返回 JSON，可能需要更换域名或网络线路");
    }
    if (!data || data.success !== 1) {
      if (endpoint === "/eapi/user/login")
        throw new SourceError(
          "AUTH_REQUIRED",
          "Z-Library 登录失败，请检查账号密码或使用 Cookie 登录",
        );
      if (/invalid credentials|please login|authentication required/i.test(data?.error ?? "")) {
        this.sessions.clear(ZLIBRARY_KEY);
        throw new SourceError("AUTH_REQUIRED", "Z-Library 登录已失效，请重新登录");
      }
      if (/limit|quota/i.test(data?.error ?? ""))
        throw new SourceError("RATE_LIMITED", "Z-Library 下载额度已用完");
      throw new SourceError("SOURCE_ERROR", "Z-Library 拒绝了请求，请检查登录状态和站点可用性");
    }
    if (!response.ok) throw new SourceError("HTTP_ERROR", `Z-Library 返回 HTTP ${response.status}`);
    return data;
  }
  async login(username: string, password: string, signal?: AbortSignal) {
    this.sessions.clear(ZLIBRARY_KEY);
    const version = this.sessions.version(ZLIBRARY_KEY);
    const result = await this.request(
      "/eapi/user/login",
      new URLSearchParams({ email: username, password }),
      signal,
    );
    const user = result.user;
    const key = user?.remix_userkey ?? user?.remix_user_key;
    if (!user?.id || !key) throw new SourceError("SOURCE_ERROR", "Z-Library 登录响应缺少会话凭据");
    try {
      this.saveCredentials(String(user.id), key, version);
      const account = await this.account(signal);
      if (!account.loggedIn) throw new SourceError("AUTH_REQUIRED", "Z-Library 未接受登录会话");
      return account;
    } catch (error) {
      if (this.sessions.version(ZLIBRARY_KEY) === version) this.sessions.clear(ZLIBRARY_KEY);
      throw error;
    }
  }
  private saveCredentials(id: string, key: string, version: number) {
    if (!/^\d+$/.test(id) || !/^[A-Za-z0-9_-]+$/.test(key))
      throw new SourceError("SOURCE_ERROR", "Z-Library 会话凭据格式无效");
    this.sessions.call(ZLIBRARY_KEY, version, "state.headers", [
      {
        "remix-userid": id,
        "remix-userkey": key,
        Cookie: `remix_userid=${id}; remix_userkey=${key}`,
      },
    ]);
    this.sessions.loggedIn(ZLIBRARY_KEY, version);
  }
  async loginCookies(id: string, key: string, signal?: AbortSignal) {
    this.sessions.clear(ZLIBRARY_KEY);
    const version = this.sessions.version(ZLIBRARY_KEY);
    try {
      this.saveCredentials(id, key, version);
      const account = await this.account(signal);
      if (!account.loggedIn) throw new SourceError("AUTH_REQUIRED", "Z-Library Cookie 登录失败");
      return account;
    } catch (error) {
      if (this.sessions.version(ZLIBRARY_KEY) === version) this.sessions.clear(ZLIBRARY_KEY);
      throw error;
    }
  }
  logout() {
    this.sessions.clear(ZLIBRARY_KEY);
  }
  async account(signal?: AbortSignal) {
    if (!this.sessions.get(ZLIBRARY_KEY).loggedIn) return { loggedIn: false };
    let result: Envelope;
    try {
      result = await this.request("/eapi/user/profile", undefined, signal);
    } catch (error) {
      if (
        error instanceof SourceError &&
        error.code === "AUTH_REQUIRED" &&
        !this.sessions.get(ZLIBRARY_KEY).loggedIn
      )
        return { loggedIn: false };
      throw error;
    }
    const { user } = result;
    if (!user) throw new SourceError("SOURCE_ERROR", "Z-Library 账号响应缺少用户信息");
    const used = Number(user.downloads_today ?? user.dailyDownloadsCount);
    const limit = Number(user.downloads_limit ?? user.dailyDownloadLimit);
    return {
      loggedIn: true,
      quota:
        Number.isFinite(used) && Number.isFinite(limit)
          ? { used, limit, remaining: Math.max(0, limit - used) }
          : undefined,
    };
  }
  async search(keyword: string, page = 1, signal?: AbortSignal) {
    const data = await this.request(
      "/eapi/book/search",
      new URLSearchParams({ message: keyword, page: String(page), limit: "30" }),
      signal,
    );
    if (!Array.isArray(data.books))
      throw new SourceError("PARSE_MISMATCH", "Z-Library 搜索响应缺少图书列表");
    return {
      books: data.books.map((book) => this.mapBook(book)),
      maxPage: data.pagination?.total_pages,
    };
  }
  private reference(ref: string) {
    // 内部使用稳定的 id/hash，避免公开详情页改版影响下载身份。
    const candidate = ref.startsWith("https://")
      ? new URL(ref).pathname.replace(/^\/eapi\/book\//, "").replace(/\/$/, "")
      : ref.replace(":", "/");
    if (!/^\d+\/[A-Za-z0-9]+$/.test(candidate))
      throw new SourceError("SOURCE_ERROR", "Z-Library 图书标识无效");
    return candidate;
  }
  bookUrl(id: string) {
    return `${this.domain()}/eapi/book/${this.reference(id)}`;
  }
  async book(ref: string, signal?: AbortSignal) {
    const data = await this.request(`/eapi/book/${this.reference(ref)}`, undefined, signal);
    if (!data.book) throw new SourceError("PARSE_MISMATCH", "Z-Library 详情响应缺少图书信息");
    return this.mapBook(data.book);
  }
  private mapBook(raw: RawBook): ZlibraryBook {
    const format = String(raw.extension ?? "").toLowerCase();
    if (
      !/^\d+$/.test(String(raw.id)) ||
      !/^[A-Za-z0-9]+$/.test(raw.hash) ||
      !raw.title ||
      !/^[a-z0-9]{1,12}$/.test(format)
    )
      throw new SourceError("PARSE_MISMATCH", "Z-Library 图书数据缺少有效标识、标题或格式");
    const size = Number(raw.filesize);
    return {
      id: `${raw.id}:${raw.hash}`,
      title: raw.title,
      author: raw.author ?? "",
      cover: raw.cover ?? "",
      description: String(raw.description ?? "").replace(/<[^>]*>/g, ""),
      format,
      size: Number.isFinite(size) && size > 0 ? size : undefined,
      language: raw.language,
      publisher: raw.publisher,
      year: raw.year == null ? undefined : String(raw.year),
    };
  }
  async download(
    ref: string,
    directory: string,
    signal: AbortSignal,
    progress: (received: number, total: number) => void,
  ) {
    signal = AbortSignal.any([signal, this.shutdown.signal]);
    const version = this.sessions.version(ZLIBRARY_KEY);
    const book = await this.book(ref, signal);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `book.${book.format}`);
    try {
      const existing = await stat(file);
      if (existing.size > 0) return { ...book, size: existing.size, path: file };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const data = await this.request(`/eapi/book/${this.reference(ref)}/file`, undefined, signal);
    const link = data.file?.downloadLink ?? data.downloadLink ?? data.url ?? data.link;
    if (!link) throw new SourceError("PARSE_MISMATCH", "Z-Library 未返回下载链接");
    let url = new URL(link, this.domain());
    let response: Response | undefined;
    for (let redirects = 0; redirects <= 10; redirects++) {
      if (url.protocol !== "https:")
        throw new SourceError("SOURCE_ERROR", "Z-Library 下载链接必须使用 HTTPS");
      response = await this.fetcher(url, {
        signal,
        redirect: "manual",
        headers: url.origin === this.domain() ? this.credentials(version) : {},
      });
      if (response.status < 300 || response.status >= 400) break;
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next || redirects === 10)
        throw new SourceError("HTTP_ERROR", "Z-Library 下载重定向无效或超过限制");
      url = new URL(next, url);
    }
    if (!response?.ok || !response.body) {
      await response?.body?.cancel();
      throw new SourceError("HTTP_ERROR", "Z-Library 文件下载失败");
    }
    if (/text\/html|application\/json/.test(response.headers.get("content-type") ?? "")) {
      await response.body.cancel();
      throw new SourceError("CHALLENGE", "Z-Library 文件地址返回了错误或验证页面");
    }
    const expected = Number(response.headers.get("content-length")) || book.size || 0;
    const staged = `${file}.part`;
    const reader = response.body.getReader();
    let received = 0;
    let prefix = Buffer.alloc(0);
    try {
      const handle = await open(staged, "w");
      try {
        for (;;) {
          signal.throwIfAborted();
          this.sessions.check(ZLIBRARY_KEY, version);
          const chunk = await reader.read();
          if (chunk.done) break;
          if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk.value]).subarray(0, 16);
          await handle.writeFile(chunk.value);
          received += chunk.value.length;
          progress(received, expected);
        }
      } finally {
        await handle.close();
      }
      signal.throwIfAborted();
      this.sessions.check(ZLIBRARY_KEY, version);
      if (!received || (expected && expected !== received))
        throw new SourceError("HTTP_ERROR", "Z-Library 文件下载不完整");
      if (
        (book.format === "pdf" && !prefix.toString("ascii").startsWith("%PDF-")) ||
        (["epub", "cbz"].includes(book.format) &&
          (prefix.length < 4 || prefix.readUInt32LE(0) !== 0x04034b50)) ||
        /^\s*(?:<!doctype|<html|\{\s*"(?:error|success)")/i.test(prefix.toString("utf8"))
      )
        throw new SourceError("PARSE_MISMATCH", "Z-Library 下载文件与标注格式不匹配");
      await rename(staged, file);
      progress(received, received);
      return { ...book, size: received, path: file };
    } finally {
      try {
        await reader.cancel();
      } finally {
        await rm(staged, { force: true });
      }
    }
  }
}
