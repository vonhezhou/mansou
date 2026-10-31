import { expect, it, vi } from "vitest";
import { fetchSubscription } from "../src/subscription.js";
import { assertNoWebView } from "../src/sources.js";

const source = { bookSourceName: "静态书源", bookSourceUrl: "https://books.test" };
const rss = {
  sourceUrl: "https://manager.test/page",
  ruleArticles: ".item",
  ruleLink: "a@href",
};
function setup(pages: Record<string, unknown>) {
  const fetcher = vi.fn(async (input: unknown) => {
    const url = String(input);
    const body = pages[url];
    const response = new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: body === undefined ? 503 : 200,
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  });
  return { fetcher, timeoutMs: 1000 };
}
it("直接合集仍严格校验，重复地址不静默覆盖", async () => {
  await expect(
    fetchSubscription("https://feed.test", setup({ "https://feed.test/": [source] })),
  ).resolves.toEqual({ sources: [source] });
  await expect(
    fetchSubscription("https://feed.test", setup({ "https://feed.test/": [source, source] })),
  ).rejects.toThrow("重复书源地址");
});
it("RSS 按规则发现合集，解码阅读导入链接并按页面顺序去重", async () => {
  const options = setup({
    "https://feed.test/": [rss],
    [rss.sourceUrl]:
      '<div class="item"><a href="yuedu://booksource/importonline?src=https%3A%2F%2Fcollection.test%2Fa">合集</a></div><div class="item"><a href="https://collection.test/b">合集</a></div>',
    "https://collection.test/a": [source],
    "https://collection.test/b": [{ ...source, bookSourceName: "另一版本" }],
  });
  await expect(fetchSubscription("https://feed.test", options)).resolves.toEqual({
    sources: [source],
  });
  expect(options.fetcher).toHaveBeenCalledTimes(4);
});
it("喵公子旧选择器失效时，仅提取明确的书源导入链接", async () => {
  const options = setup({
    "https://feed.test/": [
      {
        ...rss,
        sourceUrl: "http://yuedu.miaogongzi.net/gx.html",
        ruleArticles: "id.content@h3",
        enableJs: true,
      },
    ],
    "http://yuedu.miaogongzi.net/gx.html":
      '<a href="https://ads.test">广告</a><a href="yuedu://booksource/importonline?src=https://collection.test/a">导入</a>',
    "https://collection.test/a": [source],
  });
  await expect(fetchSubscription("https://feed.test", options)).resolves.toEqual({
    sources: [source],
  });
  expect(options.fetcher).toHaveBeenCalledTimes(3);
});
it("部分合集失败或包含非 HTTP 身份时返回明确提示；全失败则拒绝替换", async () => {
  const pages = {
    "https://feed.test/": rss,
    [rss.sourceUrl]:
      '<div class="item"><a href="https://collection.test/a">A</a><a href="https://collection.test/b">B</a></div>',
    "https://collection.test/a": [source, { ...source, bookSourceUrl: "fiction://unsupported" }],
  };
  await expect(fetchSubscription("https://feed.test", setup(pages))).resolves.toMatchObject({
    sources: [source],
    warning: expect.stringContaining("1 个合集获取失败，1 条书源格式不支持"),
  });
  await expect(
    fetchSubscription(
      "https://feed.test",
      setup({ ...pages, "https://collection.test/a": undefined }),
    ),
  ).rejects.toThrow("未获取有效书源");
});
it("RSS 脚本规则与非 HTTP 合集明确失败，不执行脚本", async () => {
  await expect(
    fetchSubscription(
      "https://feed.test",
      setup({
        "https://feed.test/": { ...rss, ruleArticles: "@js:java.ajax('x')" },
        [rss.sourceUrl]: "<div></div>",
      }),
    ),
  ).rejects.toThrow("当前不支持规则");
  await expect(
    fetchSubscription(
      "https://feed.test",
      setup({
        "https://feed.test/": rss,
        [rss.sourceUrl]: '<div class="item"><a href="file:///etc/passwd">不支持</a></div>',
      }),
    ),
  ).rejects.toThrow("HTTP/HTTPS");
});
it.each([
  { searchUrl: '/search,{"webView":true}' },
  { ruleBookInfo: { webJs: "document.title" } },
  { ruleContent: { content: "@js:java.webView(url)" } },
])("搜索或下载任一阶段需要 WebView 时排除：%j", (rules) => {
  expect(() => assertNoWebView({ ...source, ...rules })).toThrow("依赖 WebView");
});
