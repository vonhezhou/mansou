import type {
  SourceProvider,
  SourceMetadata,
  SourceAuth,
  LoginInput,
  ImageInput,
  SearchInput,
} from "@mansou/core";
import type { StorageDatabase } from "@mansou/storage";
import { SourceError } from "@mansou/novel-engine";
import { ZlibraryClient, ZLIBRARY_KEY } from "./client.js";
import type { SourceQualityService } from "../../services/sourceQuality.js";

/** 两个内容入口的启停独立，域名、Cookie 与账号统一归属 Z-Library。 */
export class ZlibraryProvider implements SourceProvider {
  constructor(
    readonly client: ZlibraryClient,
    private readonly storage: StorageDatabase,
    private readonly fetcher: typeof fetch,
    private readonly quality?: SourceQualityService,
  ) {
    quality?.register("comic", ZLIBRARY_KEY, "zlibrary-v1");
  }
  state() {
    return (
      this.storage.getSetting<{ enabled: boolean; favorite: boolean; domain: string }>(
        ZLIBRARY_KEY,
      ) ?? { enabled: false, favorite: false, domain: "https://zlib.bz" }
    );
  }
  setEnabled(enabled: boolean) {
    this.storage.setSetting(ZLIBRARY_KEY, { ...this.state(), enabled });
  }
  setFavorite(favorite: boolean) {
    this.storage.setSetting(ZLIBRARY_KEY, { ...this.state(), favorite });
  }
  info(): SourceMetadata {
    return {
      key: ZLIBRARY_KEY,
      name: "Z-Library",
      version: "1",
      url: this.state().domain,
      capabilities: {
        search: true,
        details: true,
        pages: false,
        settings: true,
        authentication: true,
      },
      searchOptions: [],
    };
  }
  async metadata() {
    return this.info();
  }
  async search(input: SearchInput) {
    const started = performance.now();
    let result: Awaited<ReturnType<ZlibraryClient["search"]>>;
    try {
      result = await this.client.search(input.keyword, input.page, this.quality?.currentSignal());
      this.quality?.record("comic", ZLIBRARY_KEY, "zlibrary-v1", {
        operation: "search",
        elapsedMs: performance.now() - started,
        nonempty: result.books.length > 0,
      });
    } catch (error) {
      this.quality?.record("comic", ZLIBRARY_KEY, "zlibrary-v1", {
        operation: "search",
        elapsedMs: performance.now() - started,
        errorCode: error instanceof SourceError ? error.code : "NETWORK_ERROR",
      });
      throw error;
    }
    return {
      comics: result.books.map((book) => ({
        id: book.id,
        title: book.title,
        cover: book.cover,
        subtitle: [book.author, book.format.toUpperCase(), book.language, book.year]
          .filter(Boolean)
          .join(" · "),
        description: book.description,
        sourceKey: ZLIBRARY_KEY,
      })),
      maxPage: result.maxPage,
    };
  }
  async searchRecommendations() {
    return [];
  }
  async comicDetails(id: string) {
    const book = await this.client.book(id);
    return {
      comicId: book.id,
      sourceKey: ZLIBRARY_KEY,
      title: book.title,
      cover: book.cover,
      subtitle: book.author,
      description: book.description,
      file: book,
    };
  }
  async comicPages(): Promise<{ images: string[] }> {
    throw new SourceError("UNSUPPORTED_RULE", "Z-Library 提供整本文件，请使用整本下载");
  }
  async loadImageBytes(input: ImageInput) {
    const url = new URL(input.imageKey);
    if (url.protocol !== "https:") throw new SourceError("SOURCE_ERROR", "封面仅支持 HTTPS 地址");
    const response = await this.fetcher(url);
    if (!response.ok) throw new SourceError("HTTP_ERROR", "Z-Library 封面请求失败");
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      await response.body?.cancel();
      throw new SourceError("HTTP_ERROR", "封面地址未返回图片");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (reader)
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 10 * 1024 * 1024)
            throw new SourceError("RESPONSE_TOO_LARGE", "封面超过 10 MiB");
          chunks.push(chunk.value);
        }
    } finally {
      await reader?.cancel();
    }
    return { data: Buffer.concat(chunks), contentType: type };
  }
  async settings() {
    return {
      schema: {
        domain: {
          title: "Z-Library 域名（书源与漫画源共用）",
          type: "input" as const,
          default: "https://zlib.bz",
        },
      },
      values: { domain: this.state().domain },
    };
  }
  async updateSettings(values: Record<string, unknown>) {
    if (Object.keys(values).some((key) => key !== "domain"))
      throw new SourceError("SOURCE_ERROR", "未知的 Z-Library 设置");
    let url: URL;
    try {
      url = new URL(String(values.domain ?? this.state().domain));
    } catch {
      throw new SourceError("SOURCE_ERROR", "请输入 HTTPS 站点域名");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new SourceError("SOURCE_ERROR", "请输入 HTTPS 站点域名");
    if (url.origin !== this.state().domain) {
      this.client.logout();
      this.storage.setSetting(ZLIBRARY_KEY, { ...this.state(), domain: url.origin });
    }
    return this.settings();
  }
  resetSettings() {
    return this.updateSettings({ domain: "https://zlib.bz" });
  }
  async invokeSetting() {
    return { ...(await this.settings()), events: [] };
  }
  async respondToDialog() {
    return { ...(await this.settings()), events: [] };
  }
  async auth(): Promise<SourceAuth> {
    const account = await this.client.account();
    return {
      ...account,
      methods: ["password", "cookies"],
      cookieFields: ["remix_userid", "remix_userkey"],
      webview: "unavailable",
    };
  }
  async login(input: LoginInput, signal?: AbortSignal) {
    if (input.method === "password")
      await this.client.login(input.username, input.password, signal);
    else await this.client.loginCookies(input.values[0] ?? "", input.values[1] ?? "", signal);
    return this.auth();
  }
  async logout() {
    this.client.logout();
    return this.auth();
  }
  // 管理页可查看 Cookie 名称，会话值仅在服务端保存。
  async cookies() {
    return this.client.sessions.get(ZLIBRARY_KEY).loggedIn
      ? [
          { name: "remix_userid", value: "", domain: new URL(this.client.domain()).hostname },
          { name: "remix_userkey", value: "", domain: new URL(this.client.domain()).hostname },
        ]
      : [];
  }
  async importCookies(url: string, values: Array<string | Record<string, unknown>> | string) {
    if (new URL(url).origin !== this.client.domain())
      throw new SourceError("SOURCE_ERROR", "Cookie 域名与 Z-Library 设置不一致");
    const cookies = new Map<string, string>();
    for (const item of typeof values === "string" ? values.split(/[;\n]/) : values) {
      if (typeof item === "string") {
        const match = item.trim().match(/^(remix_userid|remix_userkey)=([^;]+)/);
        if (match) cookies.set(match[1], match[2]);
      } else if (typeof item.name === "string" && typeof item.value === "string")
        cookies.set(item.name, item.value);
    }
    await this.client.loginCookies(
      cookies.get("remix_userid") ?? "",
      cookies.get("remix_userkey") ?? "",
    );
    return this.cookies();
  }
  async clearCookies() {
    this.client.logout();
  }
  downloadFile(
    id: string,
    directory: string,
    signal: AbortSignal,
    progress: (received: number, total: number) => void,
  ) {
    return this.client.download(id, directory, signal, progress);
  }
}
