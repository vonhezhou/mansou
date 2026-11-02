import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createStorage } from "@mansou/storage";
import {
  registerSources,
  type BookSource,
  type SourceOutcome,
  type Catalog,
} from "@mansou/novel-engine";
import { NovelEngineExecutor } from "../src/services/novels/engineExecutor.js";
import { NovelSourceService } from "../src/services/novels/sourceService.js";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
function raw(base: string): BookSource {
  return {
    bookSourceName: "HTTP 会话源",
    bookSourceUrl: base,
    enabledCookieJar: true,
    searchUrl: "/search",
    ruleSearch: { bookList: "$.books[*]", name: "$.name", bookUrl: "$.url" },
    ruleToc: { chapterList: "$.chapters[*]", chapterName: "$.title", chapterUrl: "$.url" },
    ruleContent: { content: "@js:java.ajax('/extra')" },
    loginUi: JSON.stringify([
      { name: "username", type: "text" },
      { name: "password", type: "password" },
    ]),
    loginUrl: `@js:function login(){
      const info=source.getLoginInfoMap();
      const r=java.connect('/login,'+JSON.stringify({method:'POST',body:{user:info.get('username'),password:info.get('password')}}));
      if(r.code()!==200) throw new Error('账号或密码错误');
      source.putLoginHeader(JSON.stringify({Authorization:'Bearer '+JSON.parse(r.body()).token}));
      return true;
    }`,
  };
}
async function environment() {
  const server = createServer(async (req, res) => {
    if (req.url === "/form-login") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      if (form.get("username") !== "alice" || form.get("password") !== 'secret"&+中文') {
        res.writeHead(401);
        res.end("denied");
        return;
      }
      res.setHeader("Set-Cookie", "session=ok; HttpOnly; Path=/");
      res.end("ok");
      return;
    }
    if (req.url === "/cookie-search" && req.headers.cookie?.includes("session=ok")) {
      res.end(JSON.stringify({ books: [{ name: "表单登录书籍", url: "/book" }] }));
      return;
    }
    if (req.url === "/login") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const credentials = JSON.parse(Buffer.concat(chunks).toString());
      if (credentials.user !== "alice" || credentials.password !== "secret") {
        res.writeHead(401);
        res.end("denied");
        return;
      }
      res.setHeader("Set-Cookie", ["session=ok; HttpOnly; Path=/", "scoped=yes; Path=/private"]);
      res.end(JSON.stringify({ token: "token" }));
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/landing", "set-cookie": "hop=yes; Path=/" });
      res.end();
      return;
    }
    if (req.url === "/landing") {
      res.end(JSON.stringify({ books: [{ name: req.headers.cookie, url: "/book" }] }));
      return;
    }
    if (
      req.headers.authorization !== "Bearer token" ||
      !req.headers.cookie?.includes("session=ok")
    ) {
      res.writeHead(401);
      res.end("not logged in");
      return;
    }
    if (req.headers.cookie.includes("scoped=yes")) {
      res.writeHead(400);
      res.end("Cookie path leaked");
      return;
    }
    if (req.url === "/search")
      res.end(JSON.stringify({ books: [{ name: "登录后书籍", url: "/book" }] }));
    else if (req.url === "/book")
      res.end(JSON.stringify({ chapters: [{ title: "第一章", url: "/1" }] }));
    else if (req.url === "/extra") res.end("同步宿主正文");
    else res.end(JSON.stringify({ body: "正文" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address() as { port: number };
  const dir = await mkdtemp(path.join(os.tmpdir(), "novel-runtime-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const db = createStorage(dir);
  cleanups.push(async () => db.close());
  let engine = new NovelEngineExecutor(fetch, 2000, db.novels);
  cleanups.push(() => engine.close());
  let sources = new NovelSourceService(db.novels, fetch, 2000, engine);
  const source = raw(`http://127.0.0.1:${address.port}`);
  const imported = sources.import(source).sources[0]!;
  return {
    source,
    id: imported.id,
    db,
    get sources() {
      return sources;
    },
    get engine() {
      return engine;
    },
    async restart() {
      await engine.close();
      engine = new NovelEngineExecutor(fetch, 2000, db.novels);
      sources = new NovelSourceService(db.novels, fetch, 2000, engine);
    },
  };
}

it("JS 登录、令牌和 Cookie 经 Worker 持久化，搜索/目录/同步正文共用会话", async () => {
  const env = await environment();
  expect(env.sources.account(env.id).loggedIn).toBe(false);
  const account = await env.sources.login(env.id, { username: "alice", password: "secret" });
  expect(account.loggedIn).toBe(true);
  expect(JSON.stringify(account)).not.toContain("token");
  expect(JSON.stringify(env.engine.sessions.get(env.id))).not.toContain("secret");
  const search = await env.sources.search("凡人", 1);
  expect(search.sources[0]!.error).toBeUndefined();
  expect(search.results[0]!.name).toBe("登录后书籍");
  const catalog = await env.sources.catalog(env.id, `${env.source.bookSourceUrl}/book`);
  const body = await env.engine.execute(
    "chapter",
    [env.source, catalog.chapters[0], catalog],
    undefined,
    env.id,
  );
  expect(body).toBe("同步宿主正文");
  await env.restart();
  expect(env.sources.account(env.id).loggedIn).toBe(true);
  expect((await env.sources.search("凡人", 1)).results).toHaveLength(1);
  env.sources.logout(env.id);
  expect(env.sources.account(env.id).loggedIn).toBe(false);
  expect((await env.sources.search("凡人", 1)).sources[0]!.error?.code).toBe("HTTP_ERROR");
});

it("失败登录会清理 Cookie 和令牌，不覆盖其他书源会话", async () => {
  const env = await environment();
  env.engine.sessions.call("other", 0, "state.put", ["token", "keep"]);
  await expect(env.sources.login(env.id, { username: "alice", password: "bad" })).rejects.toThrow(
    "账号或密码错误",
  );
  expect(env.sources.account(env.id).loggedIn).toBe(false);
  expect(env.engine.sessions.get(env.id)).toMatchObject({ data: {}, loginHeaders: {} });
  expect(env.engine.sessions.get("other").data.token).toBe("keep");
  await expect(env.sources.login(env.id, { injected: "x" })).rejects.toThrow("字段");
});

it("普通 HTTP 表单登录正确编码凭据并建立可搜索的 Cookie 会话", async () => {
  const env = await environment();
  env.sources.import({ ...env.source, loginUrl: "/form-login", searchUrl: "/cookie-search" });
  expect(
    (await env.sources.login(env.id, { username: "alice", password: 'secret"&+中文' })).loggedIn,
  ).toBe(true);
  expect((await env.sources.search("凡人", 1)).results[0]?.name).toBe("表单登录书籍");
});

it("loginCheckJs 可以处理 401 并返回同步重试响应", async () => {
  const env = await environment();
  await env.sources.login(env.id, { username: "alice", password: "secret" });
  env.engine.sessions.call(env.id, env.engine.sessions.version(env.id), "state.headers", [
    { Authorization: "Bearer expired" },
  ]);
  const source = {
    ...env.source,
    loginCheckJs: `if(result.code()===401){source.putLoginHeader(JSON.stringify({Authorization:'Bearer token'})); result=java.connect(result.url());} result`,
  };
  const result = await env.engine.execute<SourceOutcome>(
    "search",
    [registerSources([source])[0], "凡人", 1],
    undefined,
    env.id,
  );
  expect(result.error).toBeUndefined();
  expect(result.books[0]?.name).toBe("登录后书籍");
});

it("显式关闭 Cookie jar 时不自动保存重定向响应的 Cookie", async () => {
  const env = await environment();
  const source = {
    ...env.source,
    loginUrl: undefined,
    searchUrl: "/redirect",
    enabledCookieJar: false,
  };
  await env.engine.execute("search", [registerSources([source])[0], "凡人", 1], undefined, env.id);
  expect(env.engine.sessions.get(env.id).cookies).toBeUndefined();
});

it("重定向过程接收 Cookie 并在后续跳转使用，同域不同书源身份不共享", async () => {
  const env = await environment();
  const source = { ...env.source, searchUrl: "/redirect", loginUrl: undefined };
  const registered = registerSources([source])[0]!;
  const outcome = await env.engine.execute<SourceOutcome>(
    "search",
    [registered, "凡人", 1],
    undefined,
    "redirect-source",
  );
  expect(outcome.books[0]?.name).toContain("hop=yes");
  expect(env.engine.sessions.cookies("redirect-source", 0, source.bookSourceUrl)).toContain(
    "hop=yes",
  );
  expect(env.engine.sessions.cookies(env.id, 0, source.bookSourceUrl)).toBe("");
});

it("退出期间迟到的 Set-Cookie 和宿主写入不能恢复旧会话", async () => {
  let release!: () => void, started!: () => void;
  const beginning = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetcher: typeof fetch = async () => {
    started();
    await pending;
    return new Response('{"books":[]}', { headers: { "set-cookie": "late=yes; Path=/" } });
  };
  const engine = new NovelEngineExecutor(fetcher, 2000);
  cleanups.push(() => engine.close());
  const source = { ...raw("https://test.invalid"), loginUrl: undefined };
  const work = engine.execute<SourceOutcome>(
    "search",
    [registerSources([source])[0], "凡人", 1],
    undefined,
    "scope",
  );
  await beginning;
  engine.sessions.clear("scope");
  release();
  expect((await work).error?.code).toBe("CANCELLED");
  expect(engine.sessions.get("scope").cookies).toBeUndefined();
});

it("取消同步宿主网络时终止上游，并释放线程槽位", async () => {
  let started!: () => void, aborted!: () => void;
  const beginning = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cancellation = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  const engine = new NovelEngineExecutor(async (_url, init) => {
    started();
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener(
        "abort",
        () => {
          aborted();
          reject(init!.signal!.reason);
        },
        { once: true },
      );
    });
  }, 2000);
  cleanups.push(() => engine.close());
  const source = {
    ...raw("https://test.invalid"),
    searchUrl: '@js:java.ajax("/slow")',
    loginUrl: undefined,
  };
  const controller = new AbortController();
  const work = engine.execute(
    "search",
    [registerSources([source])[0], "凡人", 1],
    controller.signal,
  );
  await beginning;
  controller.abort();
  await expect(work).rejects.toMatchObject({ code: "CANCELLED" });
  await cancellation;
});

it("Cookie 移除同时清理目标域的不同路径，保留其他域 Cookie", async () => {
  const engine = new NovelEngineExecutor(fetch, 1000);
  cleanups.push(() => engine.close());
  const store = engine.sessions;
  store.call("scope", 0, "cookie.setCookie", [
    "https://books.test",
    "root=a; Domain=books.test; Path=/",
  ]);
  store.call("scope", 0, "cookie.setCookie", [
    "https://books.test/private",
    "private=b; Path=/private",
  ]);
  store.call("scope", 0, "cookie.setCookie", ["https://other.test", "keep=c; Path=/"]);
  store.call("scope", 0, "cookie.removeCookie", ["https://books.test"]);
  expect(store.cookies("scope", 0, "https://books.test/private")).toBe("");
  expect(store.cookies("scope", 0, "https://other.test")).toBe("keep=c");
});

it("上游非法 Set-Cookie 被忽略，不阻断合法 Cookie 或跨域接收", async () => {
  const engine = new NovelEngineExecutor(fetch, 1000);
  cleanups.push(() => engine.close());
  expect(() =>
    engine.sessions.receive("scope", 0, "https://books.test", [
      "bad=x; Domain=external.test; Path=/",
      "good=y; Path=/",
    ]),
  ).not.toThrow();
  expect(engine.sessions.cookies("scope", 0, "https://books.test")).toBe("good=y");
  expect(engine.sessions.cookies("scope", 0, "https://external.test")).toBe("");
});

it("同一书源的书籍变量隔离，并可在目录与正文 Worker 之间恢复", async () => {
  const fetcher: typeof fetch = async (input) => {
    const id = new URL(String(input)).pathname.slice(1);
    const response = new Response(
      JSON.stringify({ id, chapters: [{ title: "第一章", url: "/chapter" }] }),
    );
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
  const engine = new NovelEngineExecutor(fetcher, 2000);
  cleanups.push(() => engine.close());
  const source = {
    ...raw("https://books.test"),
    loginUrl: undefined,
    ruleBookInfo: { init: '@js:java.put("id",JSON.parse(result).id);result' },
    ruleContent: { content: '@js:java.get("id")' },
  };
  const first = await engine.execute<Catalog>(
    "catalog",
    [source, "https://books.test/first"],
    undefined,
    "same-source",
  );
  const second = await engine.execute<Catalog>(
    "catalog",
    [source, "https://books.test/second"],
    undefined,
    "same-source",
  );
  await expect(
    engine.execute("chapter", [source, first.chapters[0], first], undefined, "same-source"),
  ).resolves.toBe("first");
  await expect(
    engine.execute("chapter", [source, second.chapters[0], second], undefined, "same-source"),
  ).resolves.toBe("second");
});

it("升级时重算旧书源能力，保留规则、启停和收藏身份", async () => {
  const env = await environment();
  const row = env.db.novels.get<any>("source", env.id)!;
  row.summary = {
    ...row.summary,
    enabled: false,
    favorite: true,
    missingFromSubscription: true,
    searchSupported: false,
    downloadSupported: false,
    searchError: "旧运行时不支持 JS",
    downloadError: "旧运行时不支持 JSONPath",
  };
  env.db.novels.save("source", env.id, row);
  await env.restart();
  expect(env.sources.state().sources[0]).toMatchObject({
    id: env.id,
    enabled: false,
    favorite: true,
    missingFromSubscription: true,
    searchSupported: true,
    downloadSupported: true,
    hash: row.summary.hash,
  });
  expect(env.sources.source(env.id, false).raw).toEqual(row.raw);
});
