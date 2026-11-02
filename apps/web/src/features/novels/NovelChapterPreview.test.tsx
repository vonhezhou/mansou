import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NovelCatalog, NovelOrigin } from "../../api/novels.js";
import { NovelChapterPreview } from "./NovelChapterPreview.js";

const origin: NovelOrigin = {
  sourceId: "a",
  sourceName: "甲源",
  name: "测试小说",
  author: "作者",
  bookUrl: "https://a.test/book",
};
const catalog = (count: number, complete = true): NovelCatalog => ({
  bookUrl: origin.bookUrl,
  tocUrl: "https://a.test/toc",
  tocComplete: complete,
  tocPages: 1,
  chapters: Array.from({ length: count }, (_, i) => ({
    title: `第 ${i + 1} 章`,
    url: `https://a.test/${i + 1}`,
  })),
});
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
const click = async (text: string) =>
  act(async () => {
    button(text).click();
  });
const setCount = async (value: string) =>
  act(async () => {
    const input = container.querySelector<HTMLInputElement>("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
function fetchSuccess() {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        chapter: { title: "章节", url: body.chapterUrl },
        content: `正文 ${body.chapterUrl}\n<script>不执行</script>`,
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
}
it("任意章节和首尾 N 章均可预览，范围按目录序号计算且按需抓取", async () => {
  const fetcher = fetchSuccess();
  vi.stubGlobal("fetch", fetcher);
  await act(async () =>
    root.render(<NovelChapterPreview origin={origin} catalog={catalog(10)} selected={5} />),
  );
  expect(fetcher).not.toHaveBeenCalled();
  await click("预览所选章节");
  expect(container.textContent).toContain("正文 https://a.test/5");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("article")?.textContent).toContain("<script>不执行</script>");
  await click("开头 N 章");
  expect(container.textContent).toContain("正文 https://a.test/1");
  expect(button("上一章").disabled).toBe(true);
  await click("下一章");
  await click("下一章");
  expect(container.textContent).toContain("正文 https://a.test/3");
  expect(button("下一章").disabled).toBe(true);
  await setCount("2");
  await click("最新 N 章");
  expect(container.textContent).toContain("正文 https://a.test/9");
  await click("下一章");
  expect(container.textContent).toContain("正文 https://a.test/10");
  expect(button("下一章").disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(6);
  await setCount("");
  expect(button("开头 N 章").disabled).toBe(true);
  expect(button("最新 N 章").disabled).toBe(true);
});
it("短目录不足 N 章时按实际范围浏览；不完整目录禁止假称最新，任意章节仍可用", async () => {
  const fetcher = fetchSuccess();
  vi.stubGlobal("fetch", fetcher);
  await act(async () =>
    root.render(<NovelChapterPreview origin={origin} catalog={catalog(1)} selected={1} />),
  );
  await click("最新 N 章");
  expect(container.textContent).toContain("正文 https://a.test/1");
  expect(button("上一章").disabled).toBe(true);
  expect(button("下一章").disabled).toBe(true);
  await click("开头 N 章");
  expect(container.querySelectorAll("article")).toHaveLength(1);
  await click("关闭预览");
  expect(document.activeElement).toBe(button("预览所选章节"));
  await act(async () =>
    root.render(<NovelChapterPreview origin={origin} catalog={catalog(2, false)} selected={2} />),
  );
  expect(button("最新 N 章").disabled).toBe(true);
  await click("预览所选章节");
  expect(container.textContent).toContain("正文 https://a.test/2");
});
it("快速切章、关闭及换书源取消请求，迟到响应不能覆盖当前正文", async () => {
  const pending: Array<{ signal: AbortSignal; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          pending.push({ signal: init.signal!, resolve });
        }),
    ),
  );
  const value = catalog(10);
  await act(async () =>
    root.render(<NovelChapterPreview key="a" origin={origin} catalog={value} selected={4} />),
  );
  await click("预览所选章节");
  expect(container.textContent).toContain("正在加载章节正文");
  await click("下一章");
  expect(pending[0].signal.aborted).toBe(true);
  const respond = async (i: number, content: string) =>
    act(async () => {
      pending[i].resolve(
        new Response(JSON.stringify({ content }), {
          headers: { "content-type": "application/json" },
        }),
      );
    });
  await respond(1, "当前正文");
  await respond(0, "迟到旧正文");
  expect(container.querySelector("article")?.textContent).toBe("当前正文");
  await click("下一章");
  expect(container.querySelector("article")).toBeNull();
  await click("关闭预览");
  expect(pending[2].signal.aborted).toBe(true);
  await respond(2, "关闭后迟到");
  expect(container.querySelector("article")).toBeNull();
  await click("开头 N 章");
  await act(async () =>
    root.render(
      <NovelChapterPreview
        key="b"
        origin={{ ...origin, sourceId: "b" }}
        catalog={value}
        selected={1}
      />,
    ),
  );
  expect(pending[3].signal.aborted).toBe(true);
  await respond(3, "上一来源正文");
  expect(container.querySelector("article")).toBeNull();
  await click("开头 N 章");
  await act(async () => root.unmount());
  expect(pending[4].signal.aborted).toBe(true);
  root = createRoot(container);
});
it("正文失败显示原因并可重试，不影响章节切换", async () => {
  const fetcher = fetchSuccess();
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: { message: "书源正文为空" } }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await act(async () =>
    root.render(<NovelChapterPreview origin={origin} catalog={catalog(10)} selected={1} />),
  );
  await click("开头 N 章");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("书源正文为空");
  await click("重试正文");
  expect(container.textContent).toContain("正文 https://a.test/1");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
