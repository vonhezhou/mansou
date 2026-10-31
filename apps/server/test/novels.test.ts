import { request as httpRequest } from "node:http";
import { NovelEngineExecutor } from "../src/services/novels/engineExecutor.js";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { createStorage, type StorageDatabase } from "@mansou/storage";
import { loadCatalog, loadChapter, type BookSource } from "@mansou/novel-engine";
import { NovelSourceService } from "../src/services/novels/sourceService.js";
import { NovelDownloadService } from "../src/services/novels/downloadService.js";
import { buildApp, initializeApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";
import { readAuthConfig } from "../src/auth/config.js";

const raw: BookSource = {
  bookSourceName: "测试文本源",
  bookSourceUrl: "https://novels.test",
  searchUrl: "/search?q={{key}}&page={{page}}",
  ruleSearch: { bookList: ".book", name: "a@text", author: ".author@text", bookUrl: "a@href" },
  ruleBookInfo: { tocUrl: ".toc@href" },
  ruleToc: {
    chapterList: ".chapter",
    chapterName: "text",
    chapterUrl: "href",
    nextTocUrl: ".next@href",
  },
  ruleContent: { content: ".content@html", nextContentUrl: ".next@href" },
};
const pages: Record<string, string> = {
  "/search":
    '<div class="book"><a href="/book">凡人测试</a><span class="author">作者：测试作者</span></div>',
  "/book": '<a class="toc" href="/toc">目录</a>',
  "/toc": '<a class="chapter" href="/1">第一章</a><a class="next" href="/toc2">下一页</a>',
  "/toc2": '<a class="chapter" href="/1">重复第一章</a><a class="chapter" href="/2">第二章</a>',
  "/1": '<div class="content">第一章上半页</div><a class="next" href="/1b">下一页</a>',
  "/1b": '<div class="content">第一章下半页</div><a class="next" href="/2">下一章</a>',
  "/2": '<div class="content">第二章正文</div>',
};
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
function response(text: string, url: string, status = 200) {
  const res = new Response(text, {
    status,
    headers: { "content-type": "text/html;charset=utf-8" },
  });
  Object.defineProperty(res, "url", { value: url });
  return res;
}
async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-novels-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  let db: StorageDatabase = createStorage(dir);
  cleanups.push(async () => db.close());
  const calls: string[] = [];
  const sitePages = { ...pages };
  let collection: unknown = [raw];
  let failSubscription = false,
    failSecond = false;
  const fetcher: typeof fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    const url = String(input),
      pathname = new URL(url).pathname;
    calls.push(pathname);
    if (pathname === "/subscription")
      return response(JSON.stringify(collection), url, failSubscription ? 503 : 200);
    return response(
      sitePages[pathname] ?? "missing",
      url,
      (failSecond && pathname === "/2") || !sitePages[pathname] ? 503 : 200,
    );
  };
  let engine = new NovelEngineExecutor(fetcher, 1000);
  cleanups.push(() => engine.close());
  let sources = new NovelSourceService(db.novels, fetcher, 1000, engine);
  const createDownloads = () =>
    new NovelDownloadService(
      db.novels,
      sources,
      engine,
      { outputDir: path.join(dir, "downloads"), concurrency: 1, retries: 1 },
      (error) => {
        throw error;
      },
    );
  let downloads = createDownloads();
  cleanups.push(() => downloads.close());
  return {
    dir,
    calls,
    fetcher,
    get sources() {
      return sources;
    },
    get downloads() {
      return downloads;
    },
    setPage(pathname: string, html: string) {
      sitePages[pathname] = html;
    },
    setCollection(value: unknown) {
      collection = value;
    },
    failSubscription(value: boolean) {
      failSubscription = value;
    },
    failSecond(value: boolean) {
      failSecond = value;
    },
    async restart() {
      await downloads.close();
      await engine.close();
      db.close();
      db = createStorage(dir);
      engine = new NovelEngineExecutor(fetcher, 1000);
      sources = new NovelSourceService(db.novels, fetcher, 1000, engine);
      downloads = createDownloads();
      downloads.init();
    },
  };
}
const book = { name: "凡人测试", author: "测试作者", bookUrl: "https://novels.test/book" };
async function waitTask(downloads: NovelDownloadService, status: string) {
  await vi.waitFor(() => expect(downloads.all()[0]?.status).toBe(status), {
    interval: 10,
    timeout: 2000,
  });
  return downloads.all()[0];
}
it("导入和订阅只保留支持下载的源，更新为不支持时移除旧记录", async () => {
  const env = await setup();
  const unsupported = { ...raw, ruleContent: { content: "@js:unsupported()" } };
  const other = { ...raw, bookSourceUrl: "https://other.test" };
  expect(env.sources.import([unsupported, other]).sources.map((source) => source.url)).toEqual([
    other.bookSourceUrl,
  ]);
  const rejected = env.sources.import({ ...other, ruleContent: {} });
  expect(rejected.sources).toHaveLength(1);
  expect(rejected.importedCount).toBe(0);
  expect(rejected.rejected).toEqual([
    { name: other.bookSourceName, reason: expect.stringContaining("正文") },
  ]);
  env.sources.deleteSource(rejected.sources[0].id);
  env.setCollection([raw, { ...unsupported, bookSourceUrl: other.bookSourceUrl }]);
  const state = await env.sources.saveSubscription({
    name: "合集",
    url: "https://novels.test/subscription",
  });
  const group = state.subscriptions[1];
  expect(state.sources).toHaveLength(1);
  expect(group.count).toBe(1);
  env.setCollection([unsupported]);
  expect((await env.sources.refresh(group.id)).sources).toHaveLength(0);
  await env.restart();
  expect(env.sources.state().sources).toHaveLength(0);
});
it("批量操作去重且全有或全无，删除不破坏已有任务快照", async () => {
  const env = await setup();
  const state = env.sources.import([raw, { ...raw, bookSourceUrl: "https://other.test" }]);
  const ids = state.sources.map((source) => source.id);
  expect(() => env.sources.batch([ids[0], "missing"], "delete")).toThrow();
  expect(env.sources.state().sources).toHaveLength(2);
  expect(
    env.sources.batch([...ids, ids[0]], "disable").sources.every((source) => !source.enabled),
  ).toBe(true);
  expect(env.sources.batch(ids, "enable").sources.every((source) => source.enabled)).toBe(true);
  await env.downloads.create({ sourceId: ids[0], book, all: false, start: 1, limit: 1 });
  const taskId = env.downloads.all()[0].id;
  expect(env.sources.batch(ids, "delete").sources).toHaveLength(0);
  await env.restart();
  expect(env.sources.state().sources).toHaveLength(0);
  expect(env.downloads.all()[0].id).toBe(taskId);
});
it("订阅部分失败时保留未知旧源，但移除明确不支持下载的更新", async () => {
  const env = await setup();
  env.setCollection([raw, { ...raw, bookSourceUrl: "https://old.test" }]);
  const state = await env.sources.saveSubscription({
    name: "合集",
    url: "https://novels.test/subscription",
  });
  env.setCollection({
    sourceUrl: "https://novels.test/manager",
    ruleArticles: ".item",
    ruleLink: "a@href",
  });
  env.setPage(
    "/manager",
    '<div class="item"><a href="/newfeed">成功</a><a href="/missing">失败</a></div>',
  );
  env.setPage("/newfeed", JSON.stringify([{ ...raw, ruleContent: {} }]));
  const partial = await env.sources.refresh(state.subscriptions[1].id);
  expect(partial.sources.map((source) => source.url)).toEqual(["https://old.test"]);
  expect(partial.subscriptions[1].error).toBeTruthy();
  expect(partial.subscriptions[1].count).toBe(1);
});
it("自动聚合不受显式选源的一百项限制，停用及不支持搜索的源不参与", async () => {
  const env = await setup();
  const state = env.sources.import(
    Array.from({ length: 101 }, (_, i) => ({ ...raw, bookSourceUrl: `https://source${i}.test` })),
  );
  env.sources.import({ ...raw, enabled: false });
  env.sources.import({ ...raw, bookSourceUrl: "https://no-search.test", searchUrl: "" });
  vi.spyOn(NovelEngineExecutor.prototype, "execute").mockResolvedValue({
    status: "ok",
    books: [],
    elapsedMs: 0,
  });
  const result = await env.sources.search("测试", 1);
  expect(result.totalSources).toBe(101);
  expect(result.completedSources).toBe(101);
  expect(() =>
    env.sources.search(
      "测试",
      1,
      state.sources.map((source) => source.id),
    ),
  ).toThrow(/100/);
});
it("订阅刷新失败保留旧快照；更新保留启停，订阅和自定义源按身份隔离", async () => {
  const env = await setup();
  const subscribed = await env.sources.saveSubscription({
    name: "合集",
    url: "https://novels.test/subscription",
  });
  const source = subscribed.sources[0],
    group = subscribed.subscriptions[1];
  env.sources.setEnabled(source.id, false);
  env.failSubscription(true);
  await expect(env.sources.refresh(group.id)).rejects.toThrow(/503/);
  expect(env.sources.state().sources[0].hash).toBe(source.hash);
  expect(env.sources.state().subscriptions[1].error).toContain("503");
  env.failSubscription(false);
  env.setCollection([{ ...raw, bookSourceName: "新名称" }]);
  await env.sources.refresh(group.id);
  expect(env.sources.state().sources[0]).toMatchObject({ enabled: false, name: "新名称" });
  const imported = env.sources.import({ ...raw, bookSourceName: "本地修改" });
  expect(imported.sources).toHaveLength(2);
  env.setCollection([{ ...raw, bookSourceName: "远程再更新" }]);
  await env.sources.refresh(group.id);
  expect(env.sources.state().sources.find((source) => source.groupId === "local")?.name).toBe(
    "本地修改",
  );
  await env.sources.deleteSubscription(group.id);
  expect(env.sources.state().sources.map((source) => source.name)).toEqual(["本地修改"]);
});
it("RSS 部分更新保留未刷新的旧源和启停，全部恢复后再删除已移除的源", async () => {
  const env = await setup();
  env.setCollection([raw, { ...raw, bookSourceUrl: "https://old.test" }]);
  const state = await env.sources.saveSubscription({
    name: "RSS",
    url: "https://novels.test/subscription",
  });
  const group = state.subscriptions[1];
  env.sources.setEnabled(state.sources[0].id, false);
  env.setCollection({
    sourceUrl: "https://novels.test/manager",
    ruleArticles: ".item",
    ruleLink: "a@href",
  });
  env.setPage(
    "/manager",
    '<div class="item"><a href="/newfeed">成功</a><a href="/missing">失败</a></div>',
  );
  env.setPage("/newfeed", JSON.stringify([{ ...raw, bookSourceName: "新版" }]));
  const partial = await env.sources.refresh(group.id);
  expect(partial.sources).toHaveLength(2);
  expect(partial.sources.find((source) => source.id === state.sources[0].id)).toMatchObject({
    name: "新版",
    enabled: false,
  });
  expect(partial.subscriptions[1].error).toContain("1 个合集获取失败");
  env.setPage("/manager", '<div class="item"><a href="/newfeed">成功</a></div>');
  const complete = await env.sources.refresh(group.id);
  expect(complete.sources).toHaveLength(1);
  expect(complete.subscriptions[1].error).toBeUndefined();
});
it("目录和正文分页、URL 去重、下一章边界与截断标记符合预研语义", async () => {
  const env = await setup();
  const catalog = await loadCatalog(raw, book.bookUrl, { fetcher: env.fetcher });
  expect(catalog.tocComplete).toBe(true);
  expect(catalog.chapters.map((chapter) => chapter.title)).toEqual(["第一章", "第二章"]);
  const body = await loadChapter(raw, catalog.chapters[0], catalog, { fetcher: env.fetcher });
  expect(body).toContain("第一章上半页");
  expect(body).toContain("第一章下半页");
  expect(body).not.toContain("第二章正文");
  const limited = await loadCatalog(raw, book.bookUrl, { fetcher: env.fetcher, maxTocPages: 1 });
  expect(limited.tocComplete).toBe(false);
  await expect(
    loadChapter(raw, catalog.chapters[0], catalog, { fetcher: env.fetcher, maxContentPages: 1 }),
  ).rejects.toThrow(/分页超出/);
});
it("失败下载不提供 TXT；重启后按原规则与目录恢复，跳过已完成章节", async () => {
  const env = await setup();
  const source = env.sources.import(raw).sources[0];
  env.failSecond(true);
  const task = env.downloads.create({ sourceId: source.id, book, all: true });
  await waitTask(env.downloads, "failed");
  expect(env.downloads.all()[0].completed).toBe(1);
  await expect(env.downloads.openTxt(task.id)).rejects.toMatchObject({
    code: "DOWNLOAD_NOT_COMPLETED",
  });
  await expect(stat(path.join(env.dir, "downloads", task.id, "book.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  env.sources.import({ ...raw, ruleContent: { content: ".wrong@text" } });
  await env.restart();
  env.failSecond(false);
  env.calls.length = 0;
  await env.downloads.action(task.id, "resume");
  await waitTask(env.downloads, "completed");
  expect(env.calls).toEqual(["/2"]);
  const text = await readFile(path.join(env.dir, "downloads", task.id, "book.txt"), "utf8");
  expect(text.indexOf("第一章")).toBeLessThan(text.indexOf("第二章"));
  expect(text).toContain("第一章下半页");
  expect(text).toContain("第二章正文");
  await env.downloads.delete(task.id);
  expect(env.downloads.all()).toEqual([]);
  await expect(stat(path.join(env.dir, "downloads", task.id))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("排队后立即暂停不会被在途调度覆盖，取消后不能继续", async () => {
  const env = await setup();
  const source = env.sources.import(raw).sources[0];
  const task = env.downloads.create({ sourceId: source.id, book, all: false, start: 2, limit: 1 });
  await env.downloads.action(task.id, "pause");
  await env.downloads.close();
  expect(env.downloads.all()[0].status).toBe("paused");
  expect(env.calls).toEqual([]);
  await env.restart();
  await env.downloads.action(task.id, "cancel");
  await env.downloads.action(task.id, "resume");
  expect(env.downloads.all()[0].status).toBe("cancelled");
});
it("小说 HTTP 闭环使用现有鉴权，校验参数并返回可操作的错误", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-novels-api-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const env = await setup();
  vi.spyOn(globalThis, "fetch").mockImplementation(env.fetcher);
  const { app, context } = await buildApp(
    { ...readAuthConfig(), mode: "none" },
    { ...readConfig(), dataDir: dir },
  );
  cleanups.push(() => app.close());
  await initializeApp(context);
  const request = (method: "POST" | "PUT" | "GET", url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/v1/novels${url}`, payload });
  expect((await request("POST", "/sources/import", { sources: [{}] })).statusCode).toBe(422);
  expect((await request("POST", "/sources/import", { sources: [raw, raw] })).statusCode).toBe(422);
  expect(context.novelSources.state().sources).toHaveLength(0);
  const imported = await request("POST", "/sources/import", { sources: raw });
  expect(imported.statusCode).toBe(200);
  expect(imported.json().importedCount).toBe(1);
  expect(imported.json().rejected).toEqual([]);
  const sourceId = imported.json().sources[0].id;
  expect((await request("POST", "/sources/batch", { ids: [], action: "delete" })).statusCode).toBe(
    400,
  );
  expect(
    (await request("POST", "/sources/batch", { ids: [sourceId], action: "invalid" })).statusCode,
  ).toBe(400);
  expect(
    (await request("POST", "/sources/batch", { ids: [sourceId], action: "disable" })).json()
      .sources[0].enabled,
  ).toBe(false);
  expect(
    (await request("POST", "/sources/batch", { ids: [sourceId], action: "enable" })).json()
      .sources[0].enabled,
  ).toBe(true);
  expect((await request("POST", "/search", { keyword: "x", page: 1.5 })).statusCode).toBe(400);
  const result = await request("POST", "/search", { keyword: "凡人", sourceIds: [sourceId] });
  expect(result.statusCode).toBe(200);
  expect(result.json().results[0].name).toBe("凡人测试");
  expect(result.json().results[0].origins[0].sourceId).toBe(sourceId);
  const catalog = await request("POST", "/catalog", { sourceId, bookUrl: book.bookUrl });
  expect(catalog.json().chapters).toHaveLength(2);
  const created = await request("POST", "/downloads", {
    sourceId,
    book,
    all: false,
    start: 2,
    limit: 1,
  });
  expect(created.statusCode).toBe(200);
  await waitTask(context.novelDownloads, "completed");
  const txt = await request("GET", `/downloads/${created.json().id}/txt`);
  expect(txt.statusCode).toBe(200);
  expect(txt.headers["content-type"]).toContain("text/plain");
  expect(txt.body).toContain("第二章正文");
  expect(txt.body).not.toContain("第一章上半页");
  await request("PUT", `/sources/${encodeURIComponent(sourceId)}`, { enabled: false });
  expect(
    (await request("POST", "/search", { keyword: "凡人", sourceIds: [sourceId] })).statusCode,
  ).toBe(400);
  const protectedApp = await buildApp(
    { ...readAuthConfig(), mode: "required", origin: "https://example.test" },
    { ...readConfig(), dataDir: path.join(dir, "protected") },
  );
  cleanups.push(() => protectedApp.app.close());
  expect(
    (
      await protectedApp.app.inject({
        method: "POST",
        url: "/api/v1/novels/sources/batch",
        payload: { ids: [sourceId], action: "delete" },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await protectedApp.app.inject({ method: "GET", url: "/api/v1/novels/sources" })).statusCode,
  ).toBe(401);
  expect(
    (
      await protectedApp.app.inject({
        method: "POST",
        url: "/api/v1/novels/downloads",
        payload: { sourceId, book },
      })
    ).statusCode,
  ).toBe(401);
});
it("正则解析卡住时仍能取消线程，主服务事件循环继续响应", async () => {
  const controller = new AbortController();
  let requested!: () => void;
  const seenRequest = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const engine = new NovelEngineExecutor(async (input) => {
    requested();
    return response(
      `<div class="book"><a href="/book">${"a".repeat(100)}!</a></div>`,
      String(input),
    );
  }, 5000);
  cleanups.push(() => engine.close());
  const source = {
    ...raw,
    ruleSearch: { bookList: ".book", name: "a@text##(a+)+$##", bookUrl: "a@href" },
  };
  const result = engine.execute(
    "search",
    [{ id: "hang", source, supported: true }, "x", 1],
    controller.signal,
  );
  const rejected = expect(result).rejects.toMatchObject({ code: "CANCELLED" });
  await seenRequest;
  await new Promise((resolve) => setTimeout(resolve, 100));
  controller.abort();
  await rejected;
});
it("关闭引擎同时终止在途网络与排队操作，不遗留等待者", async () => {
  const signals: AbortSignal[] = [];
  const engine = new NovelEngineExecutor(async (_input, init) => {
    const signal = init!.signal!;
    signals.push(signal);
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  }, 5000);
  cleanups.push(() => engine.close());
  const tasks = Array.from({ length: 7 }, () => engine.execute("catalog", [raw, book.bookUrl]));
  const settled = Promise.allSettled(tasks);
  await vi.waitFor(() => expect(signals.length).toBe(4));
  await engine.close();
  expect((await settled).every((result) => result.status === "rejected")).toBe(true);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});
it.each([
  { row: '<a class="chapter" href="/3"></a>', missing: "标题" },
  { row: '<a class="chapter">第三章</a>', missing: "链接" },
])("目录条目缺少$missing 时拒绝下载，不能把部分目录导出为成功 TXT", async ({ row, missing }) => {
  const env = await setup();
  env.setPage("/toc2", `<a class="chapter" href="/2">第二章</a>${row}`);
  const source = env.sources.import(raw).sources[0];
  await expect(env.sources.catalog(source.id, book.bookUrl)).rejects.toMatchObject({
    code: "PARSE_MISMATCH",
    message: expect.stringContaining(`缺少${missing}`),
  });
  const task = env.downloads.create({ sourceId: source.id, book, all: true });
  await waitTask(env.downloads, "failed");
  expect(env.downloads.all()[0]).toMatchObject({
    completed: 0,
    error: expect.stringContaining(`缺少${missing}`),
  });
  expect(env.calls).not.toContain("/1");
  await expect(env.downloads.openTxt(task.id)).rejects.toMatchObject({
    code: "DOWNLOAD_NOT_COMPLETED",
  });
});
it.each([
  { code: "HTTP_ERROR", source: raw, body: "服务不可用", status: 503 },
  { code: "RESPONSE_TOO_LARGE", source: raw, body: "x".repeat(2 * 1024 * 1024 + 1), status: 200 },
  { code: "UNSUPPORTED_RULE", source: { ...raw, jsLib: "unsupported" }, body: "", status: 200 },
])("Worker 往返保留 $code 错误码", async ({ code, source, body, status }) => {
  const engine = new NovelEngineExecutor(
    async (input) => response(body, String(input), status),
    1000,
  );
  cleanups.push(() => engine.close());
  await expect(engine.execute("catalog", [source, book.bookUrl])).rejects.toMatchObject({ code });
});
it("单次网络超时跨 Worker 仍返回 TIMEOUT", async () => {
  const engine = new NovelEngineExecutor(
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      }),
    30,
  );
  cleanups.push(() => engine.close());
  await expect(engine.execute("catalog", [raw, book.bookUrl])).rejects.toMatchObject({
    code: "TIMEOUT",
  });
});
it("客户端断开目录请求时终止上游请求，下一次目录请求仍可用", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-novels-cancel-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  let upstreamSignal: AbortSignal | undefined;
  let hold = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (hold) {
      upstreamSignal = init!.signal!;
      return new Promise((_resolve, reject) =>
        upstreamSignal!.addEventListener("abort", () => reject(upstreamSignal!.reason), {
          once: true,
        }),
      );
    }
    return response(pages[new URL(url).pathname], url);
  });
  const { app, context } = await buildApp(
    { ...readAuthConfig(), mode: "none" },
    { ...readConfig(), dataDir: dir },
  );
  cleanups.push(() => app.close());
  await initializeApp(context);
  const sourceId = context.novelSources.import(raw).sources[0].id;
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("测试服务未监听");
  const request = httpRequest({
    hostname: "127.0.0.1",
    port: address.port,
    path: "/api/v1/novels/catalog",
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  request.on("error", () => {});
  cleanups.push(async () => {
    request.destroy();
  });
  request.end(JSON.stringify({ sourceId, bookUrl: book.bookUrl }));
  await vi.waitFor(() => expect(upstreamSignal).toBeDefined());
  request.destroy();
  await vi.waitFor(() => expect(upstreamSignal!.aborted).toBe(true));
  hold = false;
  const next = await app.inject({
    method: "POST",
    url: "/api/v1/novels/catalog",
    payload: { sourceId, bookUrl: book.bookUrl },
  });
  expect(next.statusCode).toBe(200);
  expect(next.json().chapters).toHaveLength(2);
});
it("表格的纯空白补列项不误报缺章，但不能掩盖目录选择器不匹配", async () => {
  const env = await setup();
  const source = {
    ...raw,
    ruleToc: { chapterList: ".ccss", chapterName: "a@text", chapterUrl: "a@href" },
  };
  env.setPage(
    "/toc",
    '<table><tr><td class="ccss"><a href="/1">第一章</a></td><td class="ccss"> &nbsp; </td><td class="ccss">\n</td></tr></table>',
  );
  const sourceId = env.sources.import(source).sources[0].id;
  const catalog = await env.sources.catalog(sourceId, book.bookUrl);
  expect(catalog.tocComplete).toBe(true);
  expect(catalog.chapters.map((chapter) => chapter.title)).toEqual(["第一章"]);
  env.sources.import({
    ...source,
    ruleToc: { ...source.ruleToc, chapterName: ".missing@text", chapterUrl: ".missing@href" },
  });
  await expect(env.sources.catalog(sourceId, book.bookUrl)).rejects.toMatchObject({
    code: "PARSE_MISMATCH",
  });
});

it.each([
  { code: "UND_ERR_SOCKET", reason: "对端关闭了连接" },
  { code: "ECONNRESET", reason: "连接被重置" },
  { code: "ENOTFOUND", reason: "域名解析失败" },
  { code: "UNRECOGNIZED", reason: "检查站点可达性" },
])("网络失败跨 Worker 提供可操作的原因且不泄露底层凭据：$code", async ({ code, reason }) => {
  const engine = new NovelEngineExecutor(async () => {
    throw new TypeError("fetch failed", {
      cause: Object.assign(new Error("https://user:secret@proxy.invalid/private"), { code }),
    });
  }, 1000);
  cleanups.push(() => engine.close());
  const result = await engine.execute<{ error: { code: string; message: string } }>("search", [
    { id: "network", source: raw, supported: true },
    "大乘期",
    1,
  ]);
  expect(result.error).toMatchObject({
    code: "SOURCE_ERROR",
    message: expect.stringContaining(reason),
  });
  expect(result.error.message).not.toContain("secret");
  expect(result.error.message).not.toContain("proxy.invalid");
});
