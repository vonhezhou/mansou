import { expect, it } from "vitest";
import { SourceRules, validateSourceRule } from "../src/analyzer.js";
import { withSourceScript } from "../src/script.js";
import { registerSources } from "../src/sources.js";
import { searchOne } from "../src/engine.js";
import { loadCatalog, loadChapter } from "../src/content.js";
import { buildRequest } from "../src/request.js";
import type { BookSource } from "../src/types.js";

const source: BookSource = {
  bookSourceName: "API 源",
  bookSourceUrl: "https://books.test",
  searchUrl: "/search?q={{key}}",
  ruleSearch: { bookList: "$.books[*]", name: "$.name", author: "$.author", bookUrl: "$.url" },
  ruleToc: { chapterList: "$.chapters[*]", chapterName: "$.title", chapterUrl: "$.url" },
  ruleContent: { content: "$.body" },
};
const fetcher: typeof fetch = async (input) => {
  const path = new URL(String(input)).pathname;
  const content =
    path === "/search"
      ? { books: [{ name: "凡人", author: "作者", url: "/book" }] }
      : path === "/book"
        ? { chapters: [{ title: "第一章", url: "/1" }] }
        : { body: "API 正文" };
  const response = new Response(JSON.stringify(content));
  Object.defineProperty(response, "url", { value: String(input) });
  return response;
};

it("JSONPath 完成搜索、目录与正文，不把对象伪装成 HTML 节点", async () => {
  const registered = registerSources([source])[0]!;
  expect(registered.supported).toBe(true);
  const searched = await searchOne(registered, "凡人", 1, { timeoutMs: 2000, fetcher });
  expect(searched.books[0]).toMatchObject({ name: "凡人", bookUrl: "https://books.test/book" });
  const catalog = await loadCatalog(source, searched.books[0]!.bookUrl, { fetcher });
  expect(catalog.chapters).toHaveLength(1);
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, { fetcher })).resolves.toBe(
    "API 正文",
  );
});

it("XPath 节点保留上下文，支持属性、标量和正文", () => {
  const parser = new SourceRules('<div><a href="/1">甲</a><a href="/2">乙</a></div>');
  const rows = parser.elements("@XPath://a");
  expect(rows).toHaveLength(2);
  expect(parser.string("@xpath:./@href", rows[1])).toBe("/2");
  expect(parser.string("@xpath:string(.)", rows[0])).toBe("甲");
  expect(parser.string("@xpath:count(//a)")).toBe("2");
});

it("XPath 规则贯通搜索、目录和正文", async () => {
  const raw: BookSource = {
    ...source,
    ruleSearch: { bookList: "//div[@class='book']", name: ".//a/text()", bookUrl: ".//a/@href" },
    ruleToc: {
      chapterList: "//a[@class='chapter']",
      chapterName: "./text()",
      chapterUrl: "./@href",
    },
    ruleContent: { content: "//article/text()" },
  };
  const fetcher: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    const response = new Response(
      path === "/search"
        ? '<div class="book"><a href="/book">XPath 书籍</a></div>'
        : path === "/book"
          ? '<a class="chapter" href="/1">第一章</a>'
          : "<article>XPath 正文</article>",
    );
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
  const result = await searchOne(registerSources([raw])[0]!, "凡人", 1, {
    timeoutMs: 2000,
    fetcher,
  });
  expect(result.books[0]?.name).toBe("XPath 书籍");
  const catalog = await loadCatalog(raw, result.books[0]!.bookUrl, { fetcher });
  expect(catalog.chapters[0]?.title).toBe("第一章");
  await expect(loadChapter(raw, catalog.chapters[0]!, catalog, { fetcher })).resolves.toBe(
    "XPath 正文",
  );
});

it("JS 数组和字段规则贯通搜索、目录和正文", async () => {
  const raw: BookSource = {
    ...source,
    ruleSearch: {
      bookList: "@js:JSON.parse(result).books",
      name: "@js:result.name",
      bookUrl: "@js:result.url",
    },
    ruleToc: {
      chapterList: "@js:JSON.parse(result).chapters",
      chapterName: "@js:result.title",
      chapterUrl: "@js:result.url",
    },
    ruleContent: { content: "@js:JSON.parse(result).body" },
  };
  const result = await searchOne(registerSources([raw])[0]!, "凡人", 1, {
    timeoutMs: 2000,
    fetcher,
  });
  expect(result.books[0]?.name).toBe("凡人");
  const catalog = await loadCatalog(raw, result.books[0]!.bookUrl, { fetcher });
  await expect(loadChapter(raw, catalog.chapters[0]!, catalog, { fetcher })).resolves.toBe(
    "API 正文",
  );
});

it("XPath 拒绝外部实体，不能读取文件或访问网络", () => {
  const parser = new SourceRules(
    '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>',
  );
  expect(() => parser.elements("//x")).toThrow(/实体/);
});

it("JSONPath 过滤表达式在 QuickJS 中执行，支持相对字段与数组", async () => {
  await withSourceScript(source, {}, async (script) => {
    const parser = new SourceRules(
      {
        books: [
          { name: "甲", price: 1 },
          { name: "乙", price: 9 },
        ],
      },
      script,
    );
    expect(parser.string("$.books[?(@.price < 5)].name")).toBe("甲");
    expect(parser.string("@json:$.books[*].name")).toBe("甲\n乙");
  });
});

it("脚本、内联库、模板和规则管线共享当前书源上下文", async () => {
  await withSourceScript(
    { ...source, jsLib: "function suffix(x){return x+'!'}" },
    {},
    async (script) => {
      script.setBindings({ key: "凡人", page: 2 });
      const request = buildRequest(
        { ...source, searchUrl: '@js:"/search?q="+java.encodeURI(suffix(key))+"&p="+page' },
        "凡人",
        2,
        script,
      );
      expect(request.url).toBe("https://books.test/search?q=%E5%87%A1%E4%BA%BA!&p=2");
      const parser = new SourceRules({ name: "甲" }, script);
      expect(parser.string("$.name@js:suffix(result)")).toBe("甲!");
      expect(parser.string("<js>result.name + page</js>")).toBe("甲2");
      expect(parser.string('@js:java.md5Encode("abc")')).toBe("900150983cd24fb0d6963f7d28e17f72");
    },
  );
});

it("变量 put/get 和宿主解析接口支持脚本书源", async () => {
  await withSourceScript(source, {}, async (script) => {
    const parser = new SourceRules({ name: "甲" }, script);
    expect(parser.string('@put:{"saved":"$.name"}$.name')).toBe("甲");
    expect(parser.string("@get:{saved}")).toBe("甲");
    expect(parser.string('@js:java.getString("$.name", result)')).toBe("甲");
    expect(parser.string('@js:java.get("saved")')).toBe("甲");
    expect(parser.string('@js:source.get("saved")')).toBe("");
  });
});

it("JS 无法访问 Node 全局、模块或真实宿主函数原型", async () => {
  await withSourceScript(source, {}, async (script) => {
    expect(script.evaluate("[typeof process,typeof require,typeof fetch]")).toEqual([
      "undefined",
      "undefined",
      "undefined",
    ]);
    expect(() => script.evaluate('java.ajax.constructor("return process")()')).toThrow();
    expect(() => script.evaluate("java.webView('x')")).toThrow(/尚未实现/);
  });
});

it("死循环被脚本时限终止，下一次运行不受影响", async () => {
  await expect(
    withSourceScript(source, { timeoutMs: 20 }, async (script) => script.evaluate("while(true){}")),
  ).rejects.toMatchObject({ code: "TIMEOUT" });
  await withSourceScript(source, {}, async (script) => {
    expect(script.evaluate("1+1")).toBe(2);
  });
});

it("未知宿主明确失败，不能静默返回空值", async () => {
  await withSourceScript(source, {}, async (script) => {
    expect(() => script.evaluate("java.nonexistent()")).toThrow(/尚未实现宿主/);
  });
});

it("导入不执行脚本，浏览器和非法 XPath 仍拒绝", () => {
  expect(() => validateSourceRule("@js:while(true){}")).not.toThrow();
  expect(() => validateSourceRule("@xpath://[")).toThrow(/XPath/);
  expect(
    registerSources([
      { ...source, ruleSearch: { ...source.ruleSearch, name: "@webjs:document.title" } },
    ])[0]!.supported,
  ).toBe(false);
});

it("URL 库映射按序加载，库请求不携带源级登录头", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push(String(input));
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return new Response(
      calls.length === 1
        ? "function library(){return '甲'}"
        : "function second(){return library()+'乙'}",
    );
  };
  await withSourceScript(
    {
      ...source,
      header: '{Authorization:"secret"}',
      jsLib: JSON.stringify({ first: "https://lib.test/1", second: "https://lib.test/2" }),
    },
    { fetcher },
    async (script) => {
      expect(script.evaluate("second()")).toBe("甲乙");
    },
  );
  expect(calls).toEqual(["https://lib.test/1", "https://lib.test/2"]);
});

it("异步结果明确拒绝，不能把 Promise 对象当成正文", async () => {
  await withSourceScript(source, {}, async (script) => {
    expect(() => script.evaluate("Promise.resolve('正文')")).toThrow(/同步返回/);
    expect(script.evaluate("null")).toBe(null);
  });
});

it("动态请求头、请求模板与响应 bodyJs 在相同上下文运行", async () => {
  const apiSource = {
    ...source,
    header: '@js:JSON.stringify({"X-Sign":java.md5Encode(key)})',
    searchUrl:
      '/search?sign={{java.md5Encode(key)}},{bodyJs:"JSON.stringify(JSON.parse(result).payload)"}',
  };
  const fetcher: typeof fetch = async (input, init) => {
    expect(new URL(String(input)).searchParams.get("sign")).toBe(
      "900150983cd24fb0d6963f7d28e17f72",
    );
    expect(new Headers(init?.headers).get("X-Sign")).toBe("900150983cd24fb0d6963f7d28e17f72");
    return new Response(JSON.stringify({ payload: { books: [{ name: "甲", url: "/book" }] } }));
  };
  const result = await searchOne(registerSources([apiSource])[0]!, "abc", 1, {
    timeoutMs: 2000,
    fetcher,
  });
  expect(result.error).toBeUndefined();
  expect(result.books[0]?.name).toBe("甲");
});

it("宿主字符串列表保留 textNodes 内部换行，嵌套过滤不覆盖外层 result", async () => {
  await withSourceScript(source, {}, async (script) => {
    const parser = new SourceRules("<a>甲<span>忽略</span>乙</a><a>丙</a>", script);
    expect(parser.string('@js:JSON.stringify(java.getStringList("a@textNodes", result))')).toBe(
      '["甲\\n乙","丙"]',
    );
    const json = new SourceRules({ name: "外层", books: [{ price: 1 }] }, script);
    expect(
      json.string('@js:java.getString("$.books[?(@.price < 5)].price", result);result.name'),
    ).toBe("外层");
  });
});

it("JSONPath 的缓存求值不能混用不同书源上下文", async () => {
  await withSourceScript(source, {}, async (first) => {
    first.evaluate('source.put("flag","one")');
    const a = new SourceRules({ rows: [1] }, first);
    const query = '$.rows[?(source.get("flag") === "one")]';
    expect(a.string(query)).toBe("1");
    await withSourceScript(source, {}, async (second) => {
      second.evaluate('source.put("flag","two")');
      const b = new SourceRules({ rows: [1] }, second);
      expect(b.string(query)).toBe("");
    });
    expect(a.string(query)).toBe("1");
  });
});

it("JS 列表规则读取原始响应字符串，字段规则读取当前结果对象", async () => {
  const raw = {
    ...source,
    ruleSearch: {
      bookList: "@js:JSON.parse(result).books",
      name: "@js:result.name",
      bookUrl: "@js:result.url",
    },
  };
  const result = await searchOne(registerSources([raw])[0]!, "凡人", 1, {
    timeoutMs: 2000,
    fetcher,
  });
  expect(result.error).toBeUndefined();
  expect(result.books[0]?.name).toBe("凡人");
});

it("XPath 列表可以接 CSS 字段规则，不丢弃节点属性", () => {
  const parser = new SourceRules('<div><a href="/1">甲</a></div>');
  const row = parser.elements("//div")[0];
  expect(parser.string("a@href", row)).toBe("/1");
});

it("自动登录头只发送至源站，不能随外站详情链接泄漏", async () => {
  await withSourceScript(source, {}, async (script) => {
    script.evaluate('source.putLoginHeader(JSON.stringify({Authorization:"Bearer token"}))');
    const request = buildRequest(
      { ...source, searchUrl: "https://external.test/book" },
      "",
      1,
      script,
    );
    expect(new Headers(request.headers).has("Authorization")).toBe(false);
    const own = buildRequest(source, "", 1, script);
    expect(new Headers(own.headers).get("Authorization")).toBe("Bearer token");
  });
});

it("脚本堆耗尽时受限失败，独立的新书源上下文仍可执行", async () => {
  await expect(
    withSourceScript(source, {}, async (script) =>
      script.evaluate("new ArrayBuffer(64 * 1024 * 1024)"),
    ),
  ).rejects.toMatchObject({ code: "SOURCE_ERROR" });
  await withSourceScript(source, {}, async (script) => {
    expect(script.evaluate("2+3")).toBe(5);
  });
});

it("JSON 登录模板中的动态字段正确转义引号、换行与反斜杠", async () => {
  const password = 'secret"\\\n中文';
  await withSourceScript(source, { bindings: { loginInfo: { password } } }, async (script) => {
    const request = buildRequest(
      {
        ...source,
        searchUrl:
          "/login," +
          JSON.stringify({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"password":"{{loginInfo.password}}"}',
          }),
      },
      "",
      1,
      script,
    );
    expect(JSON.parse(Buffer.from(request.body!).toString())).toEqual({ password });
  });
});
