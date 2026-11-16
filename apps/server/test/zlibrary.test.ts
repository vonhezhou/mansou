import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";
import { readAuthConfig } from "../src/auth/config.js";
import { ZlibraryClient, ZLIBRARY_KEY } from "../src/sources/zlibrary/client.js";
import { NovelSessionStore } from "../src/services/novels/sessionStore.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
const book = {
  id: 123,
  hash: "abcdef",
  title: "测试漫画",
  author: "作者",
  extension: "pdf",
  filesize: 15,
  language: "Chinese",
};
const bytes = Buffer.from("%PDF-1.7\nhello\n");
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

function upstream() {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetcher: typeof fetch = async (input, options) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(options?.headers) });
    if (url.endsWith("/login"))
      return json({ success: 1, user: { id: 7, remix_userkey: "session-secret" } });
    if (url.endsWith("/profile"))
      return json({ success: 1, user: { id: 7, downloads_today: 1, downloads_limit: 10 } });
    if (url.endsWith("/search"))
      return json({ success: 1, books: [book], pagination: { total_pages: 2 } });
    if (url.endsWith("/file"))
      return json({ success: 1, file: { downloadLink: "https://files.test/book" } });
    if (url === "https://files.test/book")
      return new Response(null, { status: 302, headers: { location: "https://cdn.test/book" } });
    if (url === "https://cdn.test/book")
      return new Response(bytes, {
        headers: { "content-type": "application/pdf", "content-length": String(bytes.length) },
      });
    return json({ success: 1, book });
  };
  return { calls, fetcher };
}
async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-zlibrary-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function environment() {
  const dir = await directory();
  const remote = upstream();
  vi.stubGlobal("fetch", remote.fetcher);
  cleanup.push(async () => vi.unstubAllGlobals());
  const built = await buildApp(
    readAuthConfig({ AUTH_MODE: "none" }),
    readConfig({ MANSOU_DATA_DIR: dir, MANSOU_PROXY: "", MANSOU_NO_PROXY: "*" }),
  );
  cleanup.push(() => built.app.close());
  return { ...built, dir, remote };
}
async function completed<T extends { status: string }>(get: () => T | null) {
  await vi.waitFor(() => expect(get()?.status).toMatch(/completed|failed/));
  expect(get()?.status).toBe("completed");
  return get()!;
}

it("两种入口通过 HTTP 共享登录、额度和退出，会话重启恢复且不泄露凭据", async () => {
  const { app, context } = await environment();
  const source = context.novelSources
    .state()
    .sources.find((source) => source.provider === "zlibrary")!;
  expect(source.enabled).toBe(false);
  await context.sources.setEnabled(ZLIBRARY_KEY, true);
  const login = await app.inject({
    method: "POST",
    url: `/api/v1/novels/sources/${source.id}/login`,
    payload: { values: { username: "account", password: "password" } },
  });
  expect(login.statusCode).toBe(200);
  expect(login.json()).toMatchObject({ loggedIn: true, quota: { limit: 10, remaining: 9 } });
  expect((await app.inject(`/api/v1/sources/${ZLIBRARY_KEY}/auth`)).json()).toMatchObject({
    loggedIn: true,
    methods: ["password", "cookies"],
  });
  const reloaded = new NovelSessionStore(context.storage.novels);
  expect(reloaded.get(ZLIBRARY_KEY).loggedIn).toBe(true);
  const metadata =
    JSON.stringify(await context.sources.metadata()) + JSON.stringify(context.novelSources.state());
  expect(metadata).not.toContain("session-secret");
  expect(metadata).not.toContain('"password"');
  await app.inject({ method: "POST", url: `/api/v1/sources/${ZLIBRARY_KEY}/auth/logout` });
  expect((await app.inject(`/api/v1/novels/sources/${source.id}/account`)).json().loggedIn).toBe(
    false,
  );
  expect(reloaded.get(ZLIBRARY_KEY).loggedIn).toBe(false);
  const cookieLogin = await app.inject({
    method: "POST",
    url: `/api/v1/sources/${ZLIBRARY_KEY}/auth/login`,
    payload: { method: "cookies", values: ["7", "cookie-secret"] },
  });
  expect(cookieLogin.json().loggedIn).toBe(true);
  expect((await context.novelSources.account(source.id)).loggedIn).toBe(true);
});

it("书籍与漫画从正常搜索入口获取文件详情，两类下载任务提供原始 PDF", async () => {
  const { app, context, remote } = await environment();
  const source = context.novelSources
    .state()
    .sources.find((source) => source.provider === "zlibrary")!;
  context.novelSources.setEnabled(source.id, true);
  await context.sources.setEnabled(ZLIBRARY_KEY, true);
  await context.novelSources.login(source.id, { username: "account", password: "password" });
  const result = await context.novelSources.search("漫画", 1, [source.id]);
  const origin = result.sources[0].books[0];
  expect(origin.file?.format).toBe("pdf");
  const catalog = await context.novelSources.catalog(source.id, origin.bookUrl);
  expect(catalog).toMatchObject({ tocComplete: true, chapters: [], file: { format: "pdf" } });
  const comic = await context.search.search(ZLIBRARY_KEY, "漫画");
  const detail = await context.sources.comicDetails(ZLIBRARY_KEY, comic.comics[0].id);
  expect(detail.file?.format).toBe("pdf");
  context.novelDownloads.init();
  await context.downloads.init();
  const novelTask = context.novelDownloads.create({
    sourceId: source.id,
    book: origin,
    all: true,
    destination: "public",
  });
  const comicTask = context.downloads.create({
    sourceKey: ZLIBRARY_KEY,
    comicId: comic.comics[0].id,
    all: true,
    destination: "public",
  });
  await completed(
    () => context.novelDownloads.all().find((task) => task.id === novelTask.id) ?? null,
  );
  const finished = await completed(() => context.downloads.find(comicTask.id));
  expect(finished).toMatchObject({
    fileFormat: "pdf",
    completed: bytes.length,
    total: bytes.length,
  });
  for (const url of [
    `/api/v1/novels/downloads/${novelTask.id}/file`,
    `/api/v1/downloads/${comicTask.id}/file`,
  ]) {
    const response = await app.inject(url);
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers["content-disposition"]).toContain(".pdf");
  }
  for (const call of remote.calls.filter((call) => /files.test|cdn.test/.test(call.url))) {
    expect(call.headers.has("cookie")).toBe(false);
    expect(call.headers.has("remix-userkey")).toBe(false);
  }
});

it("退出期间迟到的登录不能恢复共享会话", async () => {
  let finish!: (response: Response) => void;
  const client = new ZlibraryClient(
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    new NovelSessionStore(),
    () => "https://zlib.bz",
  );
  const login = client.login("account", "password");
  client.logout();
  finish(json({ success: 1, user: { id: 7, remix_userkey: "secret" } }));
  await expect(login).rejects.toMatchObject({ code: "CANCELLED" });
  expect((await client.account()).loggedIn).toBe(false);
});

it("拒绝 HTML 假文件，失败和取消清理临时文件，重试可恢复完整下载", async () => {
  const dir = await directory();
  const remote = upstream();
  let fail = true;
  const client = new ZlibraryClient(
    async (url, init) => {
      if (String(url) === "https://cdn.test/book" && fail)
        return new Response("<html>denied</html>", {
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(Buffer.byteLength("<html>denied</html>")),
          },
        });
      return remote.fetcher(url, init);
    },
    new NovelSessionStore(),
    () => "https://zlib.bz",
  );
  await expect(
    client.download("123:abcdef", dir, new AbortController().signal, () => {}),
  ).rejects.toMatchObject({ code: "PARSE_MISMATCH" });
  await expect(access(path.join(dir, "book.pdf.part"))).rejects.toThrow();
  await expect(access(path.join(dir, "book.pdf"))).rejects.toThrow();
  fail = false;
  const controller = new AbortController();
  await expect(
    client.download("123:abcdef", dir, controller.signal, () => controller.abort()),
  ).rejects.toThrow();
  await expect(access(path.join(dir, "book.pdf.part"))).rejects.toThrow();
  const result = await client.download("123:abcdef", dir, new AbortController().signal, () => {});
  expect(await readFile(result.path)).toEqual(bytes);
});

it("会话被拒绝时清除账号，API 不返回上游可能包含凭据的错误文本", async () => {
  const sessions = new NovelSessionStore();
  let rejected = false;
  const remote = upstream();
  const client = new ZlibraryClient(
    async (url, init) =>
      rejected ? json({ success: 0, error: "Invalid credentials" }) : remote.fetcher(url, init),
    sessions,
    () => "https://zlib.bz",
  );
  await client.login("account", "password");
  rejected = true;
  await expect(client.search("test")).rejects.toThrow("登录已失效");
  expect(sessions.get(ZLIBRARY_KEY).loggedIn).toBe(false);
});

it("网络流失败且 reader.cancel 拒绝时仍清理未完成文件", async () => {
  const dir = await directory();
  const remote = upstream();
  const client = new ZlibraryClient(
    async (url, init) => {
      if (String(url) === "https://cdn.test/book")
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 5));
            },
            pull(controller) {
              controller.error(new Error("network down"));
            },
          }),
          { headers: { "content-type": "application/pdf" } },
        );
      return remote.fetcher(url, init);
    },
    new NovelSessionStore(),
    () => "https://zlib.bz",
  );
  await expect(
    client.download("123:abcdef", dir, new AbortController().signal, () => {}),
  ).rejects.toThrow("network down");
  await expect(access(path.join(dir, "book.pdf.part"))).rejects.toThrow();
  await expect(access(path.join(dir, "book.pdf"))).rejects.toThrow();
});
