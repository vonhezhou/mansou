import assert from "node:assert/strict";
import { test } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import iconv from "iconv-lite";
import { HtmlRules } from "../src/rules.js";
import { buildRequest } from "../src/request.js";
import { mergeBooks, searchAll, searchOne, parseSearchHtml } from "../src/engine.js";
import { registerSources } from "../src/sources.js";
import type { BookSource, SourceOutcome } from "../src/types.js";

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("没有监听端口");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server): Promise<void> {
  const done = once(server, "close");
  server.close();
  server.closeAllConnections();
  await done;
}
function source(base: string, path = "/search", name = "测试源"): BookSource {
  return {
    bookSourceUrl: base,
    bookSourceName: name,
    searchUrl: `${path}?q={{key}}&p={{page}}`,
    ruleSearch: {
      bookList: ".bookbox",
      name: ".bookname@text",
      author: ".author.0@text",
      bookUrl: ".bookname@tag.a@href",
      coverUrl: "tag.img@src",
    },
  };
}
const html = `<div class="bookbox"><div class="bookname"><a href="/books/1">凡人修仙传</a></div><p class="author">作者：忘语</p><p class="author">分类</p><img src="/cover.jpg"></div>`;

test("原始链式规则保留父节点，索引按各父节点执行，textNodes 不含子元素", () => {
  const parser = new HtmlRules(
    `<div class="row"><b>A</b><b>B</b></div><div class="row"><b>C</b><b>D</b></div><p>before<span>nested</span>after</p>`,
  );
  assert.equal(parser.elements(".row@tag.b.0").text(), "AC");
  const p = parser.$("p")[0]!;
  assert.equal(parser.string("textNodes", p), "before\nafter");
  assert.equal(parser.string(".missing@text||tag.span@text", p), "nested");
  const row = parser.$(".row")[0]!;
  assert.equal(parser.string("tag.b.0@text&&tag.b.-1@text", row), "A\nB");
  assert.equal(parser.$(".row").length, 2);
  assert.equal(parser.elements('[class="row"]@b').length, 4);
});

test("POST 表单按 GBK 编码，JSON body 插值不会因引号破坏结构", () => {
  const s = source("https://example.com");
  s.searchUrl = `/search,{'method':'POST','charset':'gbk','body':'word={{key}}&p={{page}}'}`;
  const form = buildRequest(s, "凡人 &", 2);
  assert.equal(Buffer.from(form.body!).toString(), "word=%B7%B2%C8%CB%20%26&p=2");
  s.searchUrl = `/search,{'method':'POST','body':{'key':'{{key}}','page':'{{page}}'}}`;
  assert.deepEqual(JSON.parse(Buffer.from(buildRequest(s, 'a"&b', 3).body!).toString()), {
    key: 'a"&b',
    page: "3",
  });
  assert.throws(
    () => buildRequest({ ...s, searchUrl: '/?q={{java.ajax("x")}}' }, "x", 1),
    /不执行 JS/,
  );
});

test("浏览器、未知选项和并发率规则不能静默降级", () => {
  for (const extra of [
    { searchUrl: "/search,{webView:true}" },
    { ruleSearch: { bookList: ".bookbox", name: "@webjs:result", bookUrl: "a@href" } },
    { searchUrl: "/search,{retry:3}" },
    { concurrentRate: "1/1000" },
  ]) {
    const registered = registerSources([{ ...source("https://example.com"), ...extra }])[0]!;
    assert.equal(registered.supported, false);
    assert.ok(registered.reason);
  }
});

test("HTTP 搜索经过重定向后使用最终 URL 解析链接，自动识别 GBK 响应", async () => {
  let query = "";
  const upstream = createServer((req, res) => {
    if (req.url!.startsWith("/search")) {
      query = req.url!;
      res.writeHead(302, { location: "/new/results" });
      res.end();
    } else {
      res.writeHead(200, { "content-type": "text/html; charset=gbk" });
      res.end(iconv.encode(html.replace('href="/books/1"', 'href="books/1"'), "gbk"));
    }
  });
  const base = await listen(upstream);
  try {
    const outcome = await searchOne(registerSources([source(base)])[0]!, "凡人&x", 2, {
      timeoutMs: 2000,
    });
    assert.equal(outcome.status, "ok");
    assert.equal(new URL(query, base).searchParams.get("q"), "凡人&x");
    assert.equal(new URL(query, base).searchParams.get("p"), "2");
    assert.deepEqual(outcome.books, [
      {
        name: "凡人修仙传",
        author: "忘语",
        bookUrl: `${base}/new/books/1`,
        coverUrl: `${base}/cover.jpg`,
      },
    ]);
  } finally {
    await close(upstream);
  }
});

test("相同作品跨源合并；同名不同作者和未知作者分别保留", () => {
  const make = (id: string, author: string): SourceOutcome => ({
    sourceId: id,
    sourceName: id,
    status: "ok",
    elapsedMs: 0,
    books: [{ name: "凡人", author, bookUrl: `https://${id}.example/book` }],
  });
  const result = mergeBooks([
    make("one", "忘语"),
    make("two", "忘语"),
    make("three", "其他"),
    make("four", ""),
    make("five", ""),
  ]);
  assert.equal(result.length, 4);
  assert.equal(result[0]!.origins.length, 2);
});

test("聚合隔离 HTTP 错误和规则不匹配；不会把验证脚本标记当成必然阻断", async () => {
  const upstream = createServer((req, res) => {
    if (req.url!.startsWith("/fail")) {
      res.writeHead(403);
      res.end("denied");
    } else if (req.url!.startsWith("/challenge"))
      res.end('<title>Just a moment</title><script src="/challenge-platform"></script>');
    else if (req.url!.startsWith("/redirect-page")) res.end("<title>Redirecting...</title>");
    else res.end(`${html}<script src="/challenge-platform"></script>`);
  });
  const base = await listen(upstream);
  try {
    const sources = ["/ok", "/fail", "/challenge", "/redirect-page"].map((path, i) =>
      source(`${base}/${i}/`, path, String(i)),
    );
    const result = await searchAll(registerSources(sources), "凡人", 1, {
      timeoutMs: 2000,
      concurrency: 2,
    });
    assert.equal(result.results.length, 1);
    assert.deepEqual(
      result.sources.map((s) => s.error?.code ?? "ok"),
      ["ok", "HTTP_ERROR", "CHALLENGE", "PARSE_MISMATCH"],
    );
  } finally {
    await close(upstream);
  }
});

test("响应体大小有限制，超时覆盖响应体读取，取消后不再启动队列任务", async () => {
  const controller = new AbortController();
  const cancelledPaths: string[] = [];
  const upstream = createServer((req, res) => {
    if (req.url!.startsWith("/cancel/")) {
      cancelledPaths.push(req.url!);
      // 在确认首个请求已到达后取消，隔离前一阶段超时请求的迟到事件。
      queueMicrotask(() => controller.abort());
    }
    if (req.url!.startsWith("/large")) res.end("x".repeat(2 * 1024 * 1024 + 1));
    else {
      res.writeHead(200);
      res.write("<html>");
    }
  });
  const base = await listen(upstream);
  try {
    const large = await searchOne(registerSources([source(base, "/large")])[0]!, "x", 1, {
      timeoutMs: 2000,
    });
    assert.equal(large.error?.code, "RESPONSE_TOO_LARGE");
    const slow = await searchOne(registerSources([source(base, "/slow")])[0]!, "x", 1, {
      timeoutMs: 100,
    });
    assert.equal(slow.error?.code, "TIMEOUT");
    const result = await searchAll(
      registerSources([source(`${base}/one`, "/cancel/one"), source(`${base}/two`, "/cancel/two")]),
      "x",
      1,
      { timeoutMs: 2000, concurrency: 1, signal: controller.signal },
    );
    assert.equal(result.cancelled, true);
    assert.equal(result.completedSources, 1);
    assert.equal(result.sources[0]!.error?.code, "CANCELLED");
    assert.deepEqual(cancelledPaths, ["/cancel/one?q=x&p=1"]);
  } finally {
    await close(upstream);
  }
});

test("并发请求上限真实约束上游调用", async () => {
  let active = 0;
  let peak = 0;
  const upstream = createServer((_req, res) => {
    active++;
    peak = Math.max(peak, active);
    setTimeout(() => {
      active--;
      res.end(html);
    }, 30);
  });
  const base = await listen(upstream);
  try {
    const result = await searchAll(
      registerSources(Array.from({ length: 5 }, (_, i) => source(`${base}/${i}`))),
      "x",
      1,
      { timeoutMs: 2000, concurrency: 2 },
    );
    assert.equal(peak, 2);
    assert.equal(result.completedSources, 5);
  } finally {
    await close(upstream);
  }
});

test("兼容根节点选择、空回退及文本提取，html 不改变原 DOM", () => {
  const p = new HtmlRules(
    '<div class="row">before <b>nested</b> after<script>bad()</script><a href="/book">标题</a></div>',
  );
  const row = p.$(".row")[0]!;
  assert.equal(p.string("class.row@a@href", row), "/book");
  assert.equal(p.elements(".missing||").length, 0);
  const text = new HtmlRules("<div>before <span>nested</span> after</div>");
  assert.equal(text.string("ownText", text.$("div")[0]!), "before after");
  assert.equal(text.string("textNodes", text.$("div")[0]!), "before\nafter");
  assert.ok(p.string("html", row).startsWith('<div class="row">'));
  assert.ok(!p.string("html", row).includes("<script>"));
  assert.equal(p.$("script").length, 1);
});

test("正则替换、索引列表、排除及闭区间保留原规则顺序", () => {
  const p = new HtmlRules("<div><p>作者：甲</p><p>乙</p><p>丙</p><p>丁</p></div>");
  const row = p.$("div")[0]!;
  assert.equal(p.string("p.0@text##作者：", row), "甲");
  assert.equal(p.string("p.0@text##作者：(.*)##$1", row), "甲");
  assert.equal(p.string("p.0@text##作者：(.*)##$1###", row), "甲");
  assert.equal(p.string("p.1:2@text", row), "乙\n丙");
  assert.equal(p.elements(".missing[0:-1]").length, 0);
  assert.equal(p.string("p!0:2@text", row), "乙\n丁");
  assert.equal(p.string("p[-1:1]@text", row), "丁\n丙\n乙");
  assert.equal(p.string("p[!0,-1]@text", row), "乙\n丙");
  assert.equal(
    registerSources([
      {
        ...source("https://example.com"),
        ruleSearch: { bookList: "a:invalid-selector", name: "text", bookUrl: "href" },
      },
    ])[0]!.supported,
    false,
  );
  const s = {
    ...source("https://example.com"),
    searchUrl: '/search,{method:"POST",body:{q:"{{key}}"}}',
  };
  assert.equal(
    JSON.parse(Buffer.from(buildRequest(s, "$&{{page}}", 2).body!).toString()).q,
    "$&{{page}}",
  );
});

test("正常空结果携带验证脚本时不误判；未知页面仍保留错误", () => {
  const s = registerSources([source("https://example.com")])[0]!;
  assert.deepEqual(
    parseSearchHtml(
      s,
      '<title>搜索</title><p>共有 0 条结果</p><script src="/challenge-platform"></script>',
      s.source.bookSourceUrl,
    ),
    [],
  );
  assert.deepEqual(
    parseSearchHtml(
      s,
      "<title>小说搜索</title><p>请输入小说名称或者作者名字查找阅读小说！</p>",
      s.source.bookSourceUrl,
    ),
    [],
  );
  assert.throws(
    () => parseSearchHtml(s, "<title>Just a moment</title>", s.source.bookSourceUrl),
    /验证页/,
  );
  assert.throws(
    () => parseSearchHtml(s, "<title>陌生页面</title>", s.source.bookSourceUrl),
    /未找到搜索列表/,
  );
});
