import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NovelsView } from "./NovelsView.js";

let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const origin = {
  name: "凡人测试",
  author: "测试作者",
  bookUrl: "https://novels.test/book",
  sourceId: "local:test",
  sourceName: "测试书源",
};
it("网页从搜索结果加载有序目录、提交范围下载，并仅为完成任务提供 TXT", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests: Array<{ path: string; body?: any }> = [];
  let created = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const path = url.replace("/api/v1/novels", "");
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      requests.push({ path, body });
      let result: unknown;
      if (path === "/sources")
        result = {
          subscriptions: [{ id: "local", name: "自定义书源", enabled: true, count: 1 }],
          sources: [
            {
              id: origin.sourceId,
              groupId: "local",
              name: origin.sourceName,
              enabled: true,
              searchSupported: true,
              downloadSupported: true,
            },
          ],
        };
      else if (path === "/search")
        result = {
          keyword: body.keyword,
          page: 1,
          results: [{ name: origin.name, author: origin.author, origins: [origin] }],
          sources: [],
          totalSources: 1,
          completedSources: 1,
        };
      else if (path === "/catalog")
        result = {
          bookUrl: origin.bookUrl,
          tocComplete: true,
          tocPages: 1,
          chapters: [
            { title: "第一章", url: "https://novels.test/1" },
            { title: "第二章", url: "https://novels.test/2" },
          ],
        };
      else if (path === "/downloads" && options?.method === "POST") {
        created = true;
        result = { id: "task" };
      } else if (path === "/downloads")
        result = created
          ? [
              {
                id: "task",
                name: origin.name,
                sourceName: origin.sourceName,
                author: origin.author,
                phase: "已完成",
                status: "completed",
                total: 2,
                completed: 2,
                all: false,
                start: 1,
                limit: 2,
              },
            ]
          : [];
      else throw new Error(`Unexpected path ${path}`);
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<NovelsView />));
  const button = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === text,
    )!;
  const setValue = async (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await setValue(container.querySelector<HTMLInputElement>('[aria-label="书名或作者"]')!, "凡人");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.textContent).toContain("凡人测试");
  const card = container.querySelector<HTMLButtonElement>('[aria-label="查看 凡人测试 的详情"]')!;
  card.focus();
  await act(async () => card.click());
  expect(container.querySelector("dialog[open]")).not.toBeNull();
  expect(
    [...container.querySelectorAll(".novel-catalog li")].map((item) => item.textContent),
  ).toEqual(["1. 第一章", "2. 第二章"]);
  await act(async () => button("关闭目录").click());
  expect(document.activeElement).toBe(card);
  await act(async () => card.click());
  expect(container.querySelector("dialog[open]")).not.toBeNull();
  const ranges = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
  await setValue(ranges[1], "2");
  expect(container.querySelector('a[href$="/txt"]')).toBeNull();
  await act(async () => button("下载所选范围").click());
  expect(
    requests.find((request) => request.path === "/downloads" && request.body)?.body,
  ).toMatchObject({ sourceId: origin.sourceId, all: false, start: 1, limit: 2, book: origin });
  expect(container.querySelector('a[href="/api/v1/novels/downloads/task/txt"]')?.textContent).toBe(
    "下载 TXT",
  );
});
it.each(["关闭目录", "切换页面", "卸载页面", "加载失败", "Escape"])(
  "加载目录时%s 会取消请求并忽略迟到响应",
  async (action) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let catalogSignal: AbortSignal | undefined;
    let completeCatalog!: (response: Response) => void;
    let failCatalog!: (error: Error) => void;
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith("/sources"))
          return json({
            subscriptions: [{ id: "local", enabled: true }],
            sources: [
              {
                id: origin.sourceId,
                groupId: "local",
                name: origin.sourceName,
                enabled: true,
                searchSupported: true,
                downloadSupported: true,
              },
            ],
          });
        if (url.endsWith("/downloads")) return json([]);
        if (url.endsWith("/search"))
          return json({
            keyword: "凡人",
            page: 1,
            results: [{ name: origin.name, author: origin.author, origins: [origin] }],
            sources: [],
            totalSources: 1,
            completedSources: 1,
          });
        if (url.endsWith("/catalog")) {
          catalogSignal = options?.signal ?? undefined;
          return new Promise<Response>((resolve, reject) => {
            completeCatalog = resolve;
            failCatalog = reject;
          });
        }
        throw new Error(`Unexpected path ${url}`);
      }),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<NovelsView />));
    const button = (text: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text,
      )!;
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('[aria-label="书名或作者"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "凡人",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="查看 凡人测试 的详情"]')!.click(),
    );
    expect(catalogSignal).toBeDefined();
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    const panel = container.querySelector('[aria-label="小说目录"]')!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("正在加载所选书源目录");
    if (action === "加载失败") {
      await act(async () => failCatalog(new Error("测试连接被重置")));
      expect(panel.querySelector('[role="alert"]')?.textContent).toBe("测试连接被重置");
      expect(panel.textContent).toContain("重新加载目录");
      return;
    }
    if (action === "Escape") {
      await act(async () =>
        container
          .querySelector("dialog")!
          .dispatchEvent(new Event("cancel", { bubbles: false, cancelable: true })),
      );
    } else if (action === "卸载页面") {
      await act(async () => root!.unmount());
      root = undefined;
    } else await act(async () => button(action === "关闭目录" ? "关闭目录" : "书源与订阅").click());
    expect(catalogSignal!.aborted).toBe(true);
    // 即使外部边界迟到返回成功，也不能把已关闭的目录重新显示。
    await act(async () =>
      completeCatalog(
        json({
          tocComplete: true,
          tocPages: 1,
          chapters: [{ title: "迟到章节", url: "https://novels.test/late" }],
        }),
      ),
    );
    expect(container.querySelector('[aria-label="小说目录"]')).toBeNull();
    expect(container.textContent).not.toContain("迟到章节");
    expect(container.textContent).not.toContain("AbortError");
  },
);
it("单源与聚合选择显式传递源身份，反选为空不能意外搜索全部，翻页沿用原查询", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests: Array<{ sourceIds: string[]; keyword: string; page: number }> = [];
  const sources = [
    {
      id: origin.sourceId,
      groupId: "local",
      name: origin.sourceName,
      enabled: true,
      searchSupported: true,
      downloadSupported: true,
    },
    {
      id: "local:other",
      groupId: "local",
      name: "另一书源",
      enabled: true,
      searchSupported: true,
      downloadSupported: true,
    },
  ];
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/sources"))
        return json({ sources, subscriptions: [{ id: "local", enabled: true }] });
      if (url.endsWith("/downloads")) return json([]);
      if (url.endsWith("/search")) {
        const body = JSON.parse(String(options?.body));
        requests.push(body);
        return json({
          ...body,
          totalSources: body.sourceIds.length,
          completedSources: body.sourceIds.length,
          results: [],
          sources: body.sourceIds.map((id: string) => ({
            sourceId: id,
            sourceName: id,
            books: [],
            status: "ok",
          })),
        });
      }
      throw new Error(`Unexpected path ${url}`);
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<NovelsView />));
  const button = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === text,
    )!;
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="书名或作者"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "凡人");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const submit = () =>
    act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  await act(async () => button("反选").click());
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  await submit();
  expect(requests).toHaveLength(0);
  await act(async () => button("单源搜索").click());
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type="radio"][value="local:other"]')!.click(),
  );
  await submit();
  expect(requests[0]).toMatchObject({ keyword: "凡人", sourceIds: ["local:other"], page: 1 });
  await act(async () => button("聚合搜索").click());
  await act(async () => button("全选").click());
  await act(async () => button("下一页").click());
  expect(requests[1]).toMatchObject({ sourceIds: ["local:other"], page: 2 });
  await submit();
  expect(requests[2].sourceIds).toEqual([origin.sourceId, "local:other"]);
});
