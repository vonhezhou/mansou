import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useNovelSources } from "../../hooks/useNovelSources.js";
import { NovelsView } from "./NovelsView.js";

const navigate = vi.fn();
const reloadDownloads = vi.fn(async () => {});
function SearchHarness() {
  const sourceState = useNovelSources();
  return (
    <NovelsView
      sourceState={sourceState}
      onNavigate={navigate}
      onDownloadCreated={reloadDownloads}
    />
  );
}
let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  navigate.mockClear();
  reloadDownloads.mockReset().mockResolvedValue(undefined);
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
function searchResponse(snapshot: any) {
  const sources = snapshot.sources.length
    ? snapshot.sources
    : snapshot.results.flatMap((book: any) =>
        book.origins.map((origin: any) => ({
          sourceId: origin.sourceId,
          sourceName: origin.sourceName,
          status: "ok",
          elapsedMs: 0,
          books: [origin],
        })),
      );
  return new Response(
    [
      {
        type: "start",
        keyword: snapshot.keyword,
        page: snapshot.page,
        totalSources: snapshot.totalSources,
      },
      ...sources.map((source: any) => ({ type: "source", source, elapsedMs: 1 })),
      { type: "complete", elapsedMs: 1, cancelled: false },
    ]
      .map((event) => JSON.stringify(event) + "\n")
      .join(""),
    {
      headers: { "content-type": "application/x-ndjson" },
    },
  );
}
it.each(["完成后进入任务", "关闭后不跳转", "关闭后创建失败", "任务已创建但刷新失败"])(
  "网页加载目录、缓存重开及范围下载：%s",
  async (scenario) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const requests: Array<{ path: string; body?: any }> = [];
    let created = false;
    let completeDownload!: () => void;
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
          return searchResponse({
            keyword: body.keyword,
            page: 1,
            results: [{ name: origin.name, author: origin.author, origins: [origin] }],
            sources: [],
            totalSources: 1,
            completedSources: 1,
          });
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
          if (scenario === "关闭后不跳转" || scenario === "关闭后创建失败")
            return new Promise<Response>((resolve) => {
              completeDownload = () =>
                resolve(
                  new Response(
                    JSON.stringify(
                      scenario === "关闭后创建失败"
                        ? { error: { message: "服务不可用", code: "UPSTREAM_ERROR" } }
                        : { id: "task" },
                    ),
                    {
                      status: scenario === "关闭后创建失败" ? 503 : 200,
                      headers: { "content-type": "application/json" },
                    },
                  ),
                );
            });
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
    await act(async () => root!.render(<SearchHarness />));
    const button = (text: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text || button.getAttribute("aria-label") === text,
      )!;
    const setValue = async (input: HTMLInputElement, value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          value,
        );
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
    expect(requests.filter((request) => request.path === "/catalog")).toHaveLength(1);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>(".novel-catalog li button")].map(
        (item) => item.title,
      ),
    ).toEqual(["第一章", "第二章"]);
    await act(async () => button("关闭详情").click());
    expect(document.activeElement).toBe(card);
    await act(async () => card.click());
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    expect(requests.filter((request) => request.path === "/catalog")).toHaveLength(1);
    const ranges = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    await setValue(ranges[1], "2");
    expect(container.querySelector('a[href$="/txt"]')).toBeNull();
    if (scenario === "任务已创建但刷新失败")
      reloadDownloads.mockRejectedValueOnce(new Error("刷新失败"));
    await act(async () => {
      button("下载所选范围").click();
      button("下载所选范围").click();
    });
    expect(
      requests.find((request) => request.path === "/downloads" && request.body)?.body,
    ).toMatchObject({ sourceId: origin.sourceId, all: false, start: 1, limit: 2, book: origin });
    expect(
      requests.filter((request) => request.path === "/downloads" && request.body),
    ).toHaveLength(1);
    if (scenario === "关闭后不跳转" || scenario === "关闭后创建失败") {
      await act(async () => button("关闭详情").click());
      expect(container.querySelector("dialog")).toBeNull();
      await act(async () => completeDownload());
      if (scenario === "关闭后创建失败") {
        expect(reloadDownloads).not.toHaveBeenCalled();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain("创建下载失败");
      } else expect(reloadDownloads).toHaveBeenCalledOnce();
      expect(navigate).not.toHaveBeenCalled();
      expect(document.body.style.overflow).not.toBe("hidden");
      return;
    }
    expect(reloadDownloads).toHaveBeenCalledOnce();
    if (scenario === "任务已创建但刷新失败") {
      expect(container.querySelector('dialog [role="alert"]')?.textContent).toContain("任务已创建");
      expect(navigate).not.toHaveBeenCalled();
      return;
    }
    expect(navigate).toHaveBeenCalledWith("downloads");
    expect(container.querySelector("dialog")).toBeNull();
  },
);
it.each(["关闭详情", "卸载页面", "加载失败", "Escape"])(
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
          return searchResponse({
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
    await act(async () => root!.render(<SearchHarness />));
    const button = (text: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text || button.getAttribute("aria-label") === text,
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
      expect(panel.querySelector('[role="alert"] p')?.textContent).toBe("测试连接被重置");
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
    } else await act(async () => button("关闭详情").click());
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
it("固定搜索全部可用源，移除选择控件，翻页沿用原查询", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests: Array<{ sourceIds?: string[]; keyword: string; page: number }> = [];
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
        return searchResponse({
          ...body,
          totalSources: sources.length,
          completedSources: sources.length,
          results: [],
          sources: sources.map(({ id }) => ({
            sourceId: id,
            sourceName: id,
            books: [],
            status: id === "local:other" ? "error" : "ok",
            error: id === "local:other" ? { message: "连接失败" } : undefined,
          })),
        });
      }
      throw new Error(`Unexpected path ${url}`);
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<SearchHarness />));
  const button = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === text || button.getAttribute("aria-label") === text,
    )!;
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="书名或作者"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "test");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const submit = () =>
    act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  await submit();
  expect(requests[0]).toEqual({ keyword: "test", page: 1 });
  expect(container.querySelector('[aria-label="搜索模式"]')).toBeNull();
  expect(container.querySelector('input[type="radio"], .source-pill')).toBeNull();
  expect(container.textContent).toContain("1 个源搜索失败");
  expect(container.querySelectorAll(".aggregate-source")).toHaveLength(1);
  expect(container.querySelector(".aggregate-source")?.textContent).not.toContain("local:other");
  expect(container.querySelector(".search-source-errors")?.textContent).toContain("连接失败");
  await act(async () => button("下一页").click());
  expect(requests[1]).toEqual({ keyword: "test", page: 2 });
});

it.each(["完成", "取消", "断开", "卸载"])(
  "搜索尚未结束就显示结果和进度，%s 时保留正确状态",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    let searchSignal: AbortSignal | undefined;
    const cancelled = vi.fn();
    const emit = (event: unknown) =>
      stream.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith("/sources"))
          return new Response(
            JSON.stringify({
              subscriptions: [{ id: "local", enabled: true }],
              sources: [
                {
                  id: origin.sourceId,
                  name: origin.sourceName,
                  groupId: "local",
                  enabled: true,
                  searchSupported: true,
                  downloadSupported: true,
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          );
        if (url.endsWith("/search")) {
          searchSignal = options?.signal ?? undefined;
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                stream = controller;
              },
              cancel: cancelled,
            }),
            { headers: { "content-type": "application/x-ndjson" } },
          );
        }
        throw new Error(`Unexpected path ${url}`);
      }),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<SearchHarness />));
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
    await act(async () => emit({ type: "start", keyword: "凡人", page: 1, totalSources: 2 }));
    expect(container.textContent).toContain("0/2");
    expect(container.textContent).not.toContain("本页没有小说结果");
    await act(async () =>
      emit({
        type: "source",
        elapsedMs: 1,
        source: {
          sourceId: origin.sourceId,
          sourceName: origin.sourceName,
          status: "ok",
          elapsedMs: 1,
          books: [origin],
        },
      }),
    );
    expect(container.textContent).toContain("1/2");
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="查看 凡人测试 的详情"]')?.disabled,
    ).toBe(false);
    expect(container.querySelector(".search-results")?.getAttribute("aria-busy")).toBe("true");
    const nextPage = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "下一页",
      )!;
    expect(nextPage().disabled).toBe(true);
    if (mode === "完成") {
      await act(async () => {
        emit({
          type: "source",
          elapsedMs: 2,
          source: {
            sourceId: "other",
            sourceName: "慢源",
            status: "error",
            elapsedMs: 2,
            books: [],
            error: { code: "TIMEOUT", message: "连接超时" },
          },
        });
        emit({ type: "complete", elapsedMs: 2, cancelled: false });
        stream.close();
      });
      expect(container.textContent).toContain("2/2");
      expect(container.textContent).toContain("1 个源搜索失败");
    } else if (mode === "取消") {
      await act(async () =>
        [...container.querySelectorAll<HTMLButtonElement>("button")]
          .find((button) => button.textContent === "取消搜索")!
          .click(),
      );
      expect(searchSignal?.aborted).toBe(true);
      expect(cancelled).toHaveBeenCalledOnce();
      expect(container.textContent).toContain("搜索已取消");
    } else if (mode === "断开") {
      await act(async () => stream.close());
      expect(container.textContent).toContain("搜索连接中断");
    } else {
      await act(async () => root!.unmount());
      root = undefined;
      expect(searchSignal?.aborted).toBe(true);
      expect(cancelled).toHaveBeenCalledOnce();
      return;
    }
    expect(container.querySelector('[aria-label="查看 凡人测试 的详情"]')).not.toBeNull();
    expect(container.querySelector(".search-results")?.getAttribute("aria-busy")).toBe("false");
    expect(nextPage().disabled).toBe(false);
  },
);
