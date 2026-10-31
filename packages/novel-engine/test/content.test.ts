import { expect, it } from "vitest";
import { assertDownloadSupported, loadCatalog, loadChapter } from "../src/content.js";
import type { Catalog } from "../src/content.js";
import type { BookSource } from "../src/types.js";

const base = "https://books.test";
const source: BookSource = {
  bookSourceName: "静态文本源",
  bookSourceUrl: base,
  ruleBookInfo: { init: ".detail", tocUrl: "a@href" },
  ruleToc: {
    chapterList: ".chapter",
    chapterName: "text",
    chapterUrl: "href",
    nextTocUrl: ".next@href",
  },
  ruleContent: { content: ".body@html", nextContentUrl: ".next@href" },
};
const catalog: Catalog = {
  bookUrl: `${base}/book`,
  tocUrl: `${base}/toc`,
  tocComplete: true,
  tocPages: 1,
  chapters: [
    { title: "第一章", url: `${base}/1` },
    { title: "第二章", url: `${base}/2` },
  ],
};
type Page = string | { html: string; url: string };
function fixture(pages: Record<string, Page>) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    const path = new URL(String(input)).pathname;
    calls.push(path);
    const page = pages[path];
    if (page === undefined) throw new Error(`不应请求 ${path}`);
    const response = new Response(typeof page === "string" ? page : page.html);
    Object.defineProperty(response, "url", {
      value: typeof page === "string" ? String(input) : page.url,
    });
    return response;
  };
  return { calls, fetcher };
}
function body(text: string, ...next: string[]) {
  return `<div class="body">${text}</div>${next.map((url) => `<a class="next" href="${url}">下一页</a>`).join("")}`;
}
function toc(...entries: Array<[string, string]>) {
  return entries.map(([url, title]) => `<a class="chapter" href="${url}">${title}</a>`).join("");
}
const detail = '<div class="detail"><a href="/toc">目录</a></div>';

it("正文多链接分页按规则顺序拼接，去重且不递归子页导航", async () => {
  const env = fixture({
    "/1": body("甲", "/1", "/1b#top", "/1b", "/1c", "/2", "/toc", "/book"),
    "/1b": body("乙", "/1", "/1c", "/unexpected"),
    "/1c": body("丙", "/1b", "/unexpected"),
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).resolves.toBe("甲\n乙\n丙");
  expect(env.calls).toEqual(["/1", "/1b", "/1c"]);
});

it("单链接分页逐页发现，下一章不混入正文", async () => {
  const env = fixture({
    "/1": body("甲", "/1b"),
    "/1b": body("乙", "/1c"),
    "/1c": body("丙", "/2#top"),
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).resolves.toBe("甲\n乙\n丙");
  expect(env.calls).toEqual(["/1", "/1b", "/1c"]);
});

it("多链接列表中的重定向别名不会重复拼接同一页", async () => {
  const env = fixture({
    "/1": body("甲", "/alias", "/1b", "/1c"),
    "/alias": { html: body("乙"), url: `${base}/1b` },
    "/1c": body("丙"),
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).resolves.toBe("甲\n乙\n丙");
  expect(env.calls).toEqual(["/1", "/alias", "/1c"]);
});

it("不同分页地址重定向到同一正文页时只保留一份", async () => {
  const env = fixture({
    "/1": body("甲", "/alias-a", "/alias-b"),
    "/alias-a": { html: body("乙"), url: `${base}/1b` },
    "/alias-b": { html: body("不应拼接"), url: `${base}/1b#top` },
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).resolves.toBe("甲\n乙");
});

it("分页重定向到下一章时不拼接下一章正文", async () => {
  const env = fixture({
    "/1": body("甲", "/alias"),
    "/alias": { html: body("第二章正文"), url: `${base}/2` },
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).resolves.toBe("甲");
});

it.each(["direct", "redirect"])("单链接分页循环明确失败：%s", async (mode) => {
  const env = fixture({
    "/1": body("甲", "/1b"),
    "/1b": mode === "direct" ? body("乙", "/1#top") : { html: body("甲"), url: `${base}/1` },
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).rejects.toThrow("分页循环");
});

it("正文相对分页以重定向后的目录解析", async () => {
  const env = fixture({
    "/1": { html: body("甲", "part2"), url: `${base}/actual/part1` },
    "/actual/part2": body("乙"),
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).resolves.toBe("甲\n乙");
  expect(env.calls).toEqual(["/1", "/actual/part2"]);
});

it.each(["chain", "list"])("正文超出页数上限失败，不返回部分正文：%s", async (mode) => {
  const env = fixture({
    "/1": body("甲", ...(mode === "chain" ? ["/1b"] : ["/1b", "/1c"])),
    "/1b": body("乙", "/1c"),
  });
  await expect(
    loadChapter(source, catalog.chapters[0]!, catalog, {
      ...env,
      maxContentPages: 2,
    }),
  ).rejects.toThrow("分页超出限制");
  expect(env.calls).toEqual(["/1", "/1b"]);
});

it("任一列出的正文分页为空则整章失败", async () => {
  const env = fixture({ "/1": body("甲", "/1b", "/1c"), "/1b": body("") });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).rejects.toMatchObject({
    code: "PARSE_MISMATCH",
  });
});

it("正文累计超过 4 MiB 时失败，即使每页均小于响应上限", async () => {
  const text = "甲".repeat(500000);
  const env = fixture({
    "/1": body(text, "/1b", "/1c"),
    "/1b": body(text),
    "/1c": body(text),
  });
  await expect(loadChapter(source, catalog.chapters[0]!, catalog, env)).rejects.toMatchObject({
    code: "RESPONSE_TOO_LARGE",
  });
});

it.each([0, 1])("单章大小限制包含分页间的换行：超出 %s 字节", async (extra) => {
  const size = 4 * 1024 * 1024;
  const part = "x".repeat(1500000);
  const env = fixture({
    "/1": body(part, "/1b", "/1c"),
    "/1b": body(part),
    "/1c": body("x".repeat(size - 2 * part.length - 2 + extra)),
  });
  const result = loadChapter(source, catalog.chapters[0]!, catalog, env);
  if (extra) await expect(result).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  else expect(Buffer.byteLength(await result)).toBe(size);
});

it("正文保留段落换行、去掉脚本并应用替换规则", async () => {
  const env = fixture({
    "/1": body("<p>甲<br>乙</p><p>广告：删除</p><script>bad()</script><p>丙</p>"),
  });
  await expect(
    loadChapter(
      {
        ...source,
        ruleContent: { content: ".body@html", replaceRegex: "##广告：删除" },
      },
      catalog.chapters[0]!,
      catalog,
      env,
    ),
  ).resolves.toBe("甲\n乙\n丙");
});

it("取消多分页下载后不启动后续分页", async () => {
  const controller = new AbortController();
  const env = fixture({ "/1": body("甲", "/1b", "/1c") });
  const fetcher: typeof fetch = async (input, init) => {
    const response = await env.fetcher(input, init);
    controller.abort();
    return response;
  };
  await expect(
    loadChapter(source, catalog.chapters[0]!, catalog, {
      fetcher,
      signal: controller.signal,
    }),
  ).rejects.toBeDefined();
  expect(env.calls).toEqual(["/1"]);
});

it("正文替换作用于格式化、合并后的全文，可以跨页匹配", async () => {
  const env = fixture({ "/1": body("甲", "/1b"), "/1b": body("乙") });
  await expect(
    loadChapter(
      {
        ...source,
        ruleContent: { ...(source.ruleContent as object), replaceRegex: "##甲\\s+乙##合并" },
      },
      catalog.chapters[0]!,
      catalog,
      env,
    ),
  ).resolves.toBe("合并");
});

it("正文替换看到的是文本换行，不是原始 HTML 标签", async () => {
  const env = fixture({ "/1": body("<p>广告</p><p>正文</p>") });
  await expect(
    loadChapter(
      {
        ...source,
        ruleContent: { content: ".body@html", replaceRegex: "##^广告\\n" },
      },
      catalog.chapters[0]!,
      catalog,
      env,
    ),
  ).resolves.toBe("正文");
});

it("全文替换清空正文时不能导出空章节", async () => {
  const env = fixture({ "/1": body("甲", "/1b"), "/1b": body("乙") });
  await expect(
    loadChapter(
      {
        ...source,
        ruleContent: { ...(source.ruleContent as object), replaceRegex: "##甲\\s+乙" },
      },
      catalog.chapters[0]!,
      catalog,
      env,
    ),
  ).rejects.toMatchObject({ code: "PARSE_MISMATCH" });
});

it("全文替换扩张后仍受单章大小限制", async () => {
  const env = fixture({ "/1": body("a".repeat(500000)) });
  await expect(
    loadChapter(
      {
        ...source,
        ruleContent: { content: ".body@text", replaceRegex: "##a##aaaaaaaaaa" },
      },
      catalog.chapters[0]!,
      catalog,
      env,
    ),
  ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
});

it("逆序目录跨页合并，去除重复 URL 和锚点", async () => {
  const env = fixture({
    "/book": detail,
    "/toc": toc(["/3", "第三章"], ["/2#top", "第二章"]) + '<a class="next" href="/toc2">下页</a>',
    "/toc2": toc(["/2", "第二章"], ["/1", "第一章"]),
  });
  const result = await loadCatalog(
    {
      ...source,
      ruleToc: { ...(source.ruleToc as object), chapterList: "-.chapter" },
    },
    catalog.bookUrl,
    env,
  );
  expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第一章", "第二章", "第三章"]);
  expect(result).toMatchObject({ tocComplete: true, tocPages: 2 });
});

it("目录使用最终地址解析章节，重定向别名不重复解析", async () => {
  const env = fixture({
    "/book": detail,
    "/toc": {
      html: toc(["1", "第一章"]) + '<a class="next" href="/alias">下页</a>',
      url: `${base}/actual/toc`,
    },
    "/alias": { html: toc(["bad", "不应解析"]), url: `${base}/actual/toc` },
  });
  const result = await loadCatalog(source, catalog.bookUrl, env);
  expect(result).toMatchObject({ tocUrl: `${base}/actual/toc`, tocComplete: true, tocPages: 2 });
  expect(result.chapters).toEqual([{ title: "第一章", url: `${base}/actual/1` }]);
});

it("达到目录页数上限时，队列仅剩已访问的重定向地址仍算完整", async () => {
  const env = fixture({
    "/book": detail,
    "/toc":
      toc(["/1", "第一章"]) +
      '<a class="next" href="/alias">别名</a><a class="next" href="/actual">下页</a>',
    "/alias": { html: toc(["/2", "第二章"]), url: `${base}/actual` },
  });
  const result = await loadCatalog(source, catalog.bookUrl, { ...env, maxTocPages: 2 });
  expect(result).toMatchObject({ tocComplete: true, tocPages: 2 });
  expect(env.calls).toEqual(["/book", "/toc", "/alias"]);
});

it("目录仍有未访问页时标为截断", async () => {
  const env = fixture({
    "/book": detail,
    "/toc": toc(["/1", "第一章"]) + '<a class="next" href="/toc2">下页</a>',
  });
  await expect(
    loadCatalog(source, catalog.bookUrl, {
      ...env,
      maxTocPages: 1,
    }),
  ).resolves.toMatchObject({ tocComplete: false, tocPages: 1 });
});

it("详情 init 未匹配时不能猜测目录", async () => {
  const env = fixture({ "/book": '<a href="/toc">目录</a>' });
  await expect(loadCatalog(source, catalog.bookUrl, env)).rejects.toThrow("init 未匹配");
  expect(env.calls).toEqual(["/book"]);
});

it("目录循环回首页时终止遍历，不重复章节或请求", async () => {
  const env = fixture({
    "/book": detail,
    "/toc": toc(["/1", "第一章"]) + '<a class="next" href="/toc2">下页</a>',
    "/toc2": toc(["/2", "第二章"]) + '<a class="next" href="/toc#top">首页</a>',
  });
  const result = await loadCatalog(source, catalog.bookUrl, env);
  expect(result).toMatchObject({ tocComplete: true, tocPages: 2 });
  expect(result.chapters).toHaveLength(2);
  expect(env.calls).toEqual(["/book", "/toc", "/toc2"]);
});

it("目录后续页缺失章节链接时失败，不返回部分完整目录", async () => {
  const env = fixture({
    "/book": detail,
    "/toc": toc(["/1", "第一章"]) + '<a class="next" href="/toc2">下页</a>',
    "/toc2": '<a class="chapter">第二章</a>',
  });
  await expect(loadCatalog(source, catalog.bookUrl, env)).rejects.toMatchObject({
    code: "PARSE_MISMATCH",
  });
});

it("目录超过五万章时失败，不静默丢掉超额章节", async () => {
  const rows = (start: number, count: number) =>
    toc(
      ...Array.from({ length: count }, (_, i): [string, string] => [
        `/${start + i}`,
        `章节${start + i}`,
      ]),
    );
  const env = fixture({
    "/book": detail,
    "/toc": rows(1, 25000) + '<a class="next" href="/toc2">下页</a>',
    "/toc2": rows(25001, 25001),
  });
  await expect(loadCatalog(source, catalog.bookUrl, env)).rejects.toMatchObject({
    code: "RESPONSE_TOO_LARGE",
  });
});

it.each(["isVolume", "formatJs"])("未实现的目录语义在下载前拒绝：%s", (field) => {
  expect(() =>
    assertDownloadSupported({
      ...source,
      ruleToc: { ...(source.ruleToc as object), [field]: "text" },
    }),
  ).toThrow("尚未支持");
});
