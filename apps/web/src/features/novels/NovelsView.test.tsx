import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NovelsView } from "./NovelsView.js";

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
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
  await setValue(container.querySelector<HTMLInputElement>("input")!, "凡人");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.textContent).toContain("凡人测试");
  await act(async () => button("测试书源 · 目录与下载").click());
  expect(
    [...container.querySelectorAll(".novel-catalog li")].map((item) => item.textContent),
  ).toEqual(["1. 第一章", "2. 第二章"]);
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
