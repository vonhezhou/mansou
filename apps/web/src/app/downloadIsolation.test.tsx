import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../App.js";
import { authApi } from "../api/auth.js";
import { novelApi, type NovelTask } from "../api/novels.js";
import { mansouApi } from "../api/mansou.js";
import type { DownloadTask } from "../types.js";

const renders = vi.hoisted(() => ({ search: vi.fn(), sources: vi.fn() }));
vi.mock("../features/search/SearchView.js", async (importOriginal) => {
  const { SearchView } = await importOriginal<typeof import("../features/search/SearchView.js")>();
  return {
    SearchView: (props: Parameters<typeof SearchView>[0]) => {
      renders.search();
      return <SearchView {...props} />;
    },
  };
});
vi.mock("../features/sources/SourcesView.js", async (importOriginal) => {
  const { SourcesView } =
    await importOriginal<typeof import("../features/sources/SourcesView.js")>();
  return {
    SourcesView: (props: Parameters<typeof SourcesView>[0]) => {
      renders.sources();
      return <SourcesView {...props} />;
    },
  };
});

class TestEventSource extends EventTarget {
  static current: TestEventSource;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    super();
    TestEventSource.current = this;
  }
}
let container: HTMLDivElement;
let root: Root;
const task = (status = "running", completed = 0): DownloadTask => ({
  id: "task",
  sourceKey: "mock",
  comicId: "comic",
  title: "下载中的漫画",
  status,
  phase: "downloading_images",
  total: 100,
  completed,
});
async function snapshot(status = "running", completed = 0) {
  await act(async () =>
    TestEventSource.current.dispatchEvent(
      new MessageEvent("downloads", { data: JSON.stringify([task(status, completed)]) }),
    ),
  );
}
async function click(selector: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  vi.stubGlobal("EventSource", TestEventSource);
  vi.spyOn(mansouApi, "getSourceRepository").mockResolvedValue({ subscriptions: [], sources: [] });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState(null, "", "/#search");
  vi.spyOn(authApi, "session").mockResolvedValue({
    mode: "none",
    authenticated: true,
    initialized: true,
  });
  vi.spyOn(mansouApi, "health").mockResolvedValue({ ok: true, name: "test", dataDir: "/data" });
  vi.spyOn(mansouApi, "listInstalledSources").mockResolvedValue([
    { key: "mock", name: "Mock", hasSearch: true },
  ]);
  vi.spyOn(mansouApi, "listSourceMetadata").mockResolvedValue([
    { key: "mock", name: "Mock", enabled: true },
  ]);
  vi.spyOn(mansouApi, "listAvailableSources").mockResolvedValue([{ key: "mock", name: "Mock" }]);
  vi.spyOn(mansouApi, "getSourceAuth").mockResolvedValue({
    loggedIn: false,
    methods: [],
    cookieFields: [],
    webview: "unsupported",
  });
  vi.spyOn(mansouApi, "getCacheStats").mockResolvedValue({ files: 0, bytes: 0 });
  vi.spyOn(mansouApi, "listDownloads").mockResolvedValue([task()]);
  vi.spyOn(novelApi, "tasks").mockResolvedValue([]);
  vi.spyOn(novelApi, "state").mockResolvedValue({ sources: [], subscriptions: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
  renders.search.mockClear();
  renders.sources.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(TestEventSource.current.close).toHaveBeenCalledOnce();
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("isolates search from progress and active-count changes while keeping counts and the downloads page current", async () => {
  for (let completed = 1; completed <= 20; completed++) await snapshot("running", completed);
  expect(renders.search).not.toHaveBeenCalled();
  await snapshot("completed", 100);
  expect(renders.search).not.toHaveBeenCalled();
  expect(container.querySelector('.sidebar [aria-label="下载任务"] b')?.textContent).toBe("0");
  await click('.sidebar [aria-label="下载任务"]');
  expect(container.querySelector<HTMLProgressElement>(".download-card progress")?.value).toBe(100);
  await snapshot("running", 25);
  expect(container.querySelector<HTMLProgressElement>(".download-card progress")?.value).toBe(25);
  expect(container.querySelector('.sidebar [aria-label="下载任务"] b')?.textContent).toBe("1");
  await click('.sidebar [aria-label="漫画搜索"]');
  renders.search.mockClear();
  await snapshot("running", 30);
  expect(renders.search).not.toHaveBeenCalled();
});

it("keeps source management independent of progress without losing its input state", async () => {
  await click('.sidebar [aria-label="漫画源"]');
  expect(container.querySelector(".current-source-panel")).toBeNull();
  expect(container.querySelector(".repository-panel")).toBeNull();
  expect(mansouApi.getSourceAuth).not.toHaveBeenCalled();
  await click(".installed-source-grid .source-actions button:nth-child(2)");
  const cookieUrl = container.querySelector<HTMLInputElement>(".current-source-panel input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      cookieUrl,
      "https://example.com",
    );
    cookieUrl.dispatchEvent(new Event("input", { bubbles: true }));
  });
  renders.sources.mockClear();
  await snapshot("running", 30);
  await snapshot("paused", 30);
  expect(renders.sources).not.toHaveBeenCalled();
  expect(container.querySelector(".current-source-panel input")).toBe(cookieUrl);
  expect(cookieUrl.value).toBe("https://example.com");
  await click('[aria-label="关闭Mock · Cookie"]');
  await click(".installed-source-grid .source-actions button:nth-child(2)");
  expect(container.querySelector<HTMLInputElement>(".current-source-panel input")?.value).toBe(
    "https://example.com",
  );
  expect(mansouApi.getSourceAuth).not.toHaveBeenCalled();
});

const novelTask = (status: NovelTask["status"] = "running", completed = 1): NovelTask => ({
  id: "novel-task",
  bookUrl: "https://novel.test/book",
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
  sourceId: "novel-source",
  sourceName: "小说测试源",
  name: "统一下载的小说",
  author: "测试作者",
  status,
  phase: status === "completed" ? "已完成" : "下载中",
  total: 5,
  completed,
  all: false,
  start: 1,
  limit: 5,
});

it("小说进度不重绘搜索页，侧栏计数和统一下载的分类、TXT 与任务操作保持同步", async () => {
  vi.mocked(novelApi.tasks).mockResolvedValue([novelTask()]);
  const refreshNovels = () =>
    act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await refreshNovels();
  expect(renders.search).not.toHaveBeenCalled();
  expect(container.querySelector('.sidebar [aria-label="下载任务"] b')?.textContent).toBe("2");
  await click('.sidebar [aria-label="下载任务"]');
  expect(container.textContent).toContain("下载中的漫画");
  expect(container.textContent).toContain("统一下载的小说");
  expect(container.querySelector('a[href$="/novel-task/txt"]')).toBeNull();
  const action = vi.spyOn(novelApi, "action").mockResolvedValue(novelTask("paused", 2));
  vi.mocked(novelApi.tasks).mockResolvedValue([novelTask("paused", 2)]);
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="小说下载任务"] button')!.click(),
  );
  expect(action).toHaveBeenCalledWith("novel-task", "pause");
  expect(container.querySelector('.sidebar [aria-label="下载任务"] b')?.textContent).toBe("1");
  const novelTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (x) => x.textContent === "小说",
  )!;
  await act(async () => novelTab.click());
  expect(container.querySelector('[aria-label="漫画下载任务"]')).toBeNull();
  vi.mocked(novelApi.tasks).mockResolvedValue([novelTask("completed", 5)]);
  await refreshNovels();
  expect(container.querySelector('a[href$="/novel-task/txt"]')?.textContent).toBe("下载 TXT");
  await click('.sidebar [aria-label="漫画搜索"]');
  renders.search.mockClear();
  vi.mocked(novelApi.tasks).mockResolvedValue([novelTask("running", 3)]);
  await refreshNovels();
  expect(renders.search).not.toHaveBeenCalled();
});

it("小说源独立导航，已导入源、订阅和规则编辑按漫画源的管理模式分开", async () => {
  await click('.sidebar [aria-label="小说源"]');
  expect(window.location.hash).toBe("#novel-sources");
  expect(container.querySelector("h1")?.textContent).toBe("小说源");
  const activePanel = () => container.querySelector('[role="tabpanel"]:not([hidden])')!;
  expect(activePanel().textContent).toContain("已导入书源");
  expect(activePanel().textContent).not.toContain("订阅地址");
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((x) => x.textContent === "导入书源")!
      .click(),
  );
  expect(container.querySelector("dialog[open] textarea")).not.toBeNull();
  await click('[aria-label="关闭导入与编辑书源"]');
  const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  await act(async () => tabs[1].click());
  expect(activePanel().textContent).toContain("订阅地址");
  expect(activePanel().textContent).not.toContain("已导入书源");
  await click('.sidebar [aria-label="小说搜索"]');
  expect(container.querySelector(".novel-main-tabs")).toBeNull();
  expect(container.querySelector('nav[aria-label="小说功能"]')).toBeNull();
});

it("从小说详情创建下载后进入统一下载页并刷新任务快照", async () => {
  const book = {
    name: "统一下载的小说",
    author: "测试作者",
    sourceId: "novel-source",
    sourceName: "小说测试源",
    bookUrl: "https://novel.test/book",
  };
  vi.mocked(novelApi.state).mockResolvedValue({
    subscriptions: [{ id: "local", enabled: true }],
    sources: [
      {
        id: book.sourceId,
        name: book.sourceName,
        groupId: "local",
        enabled: true,
        searchSupported: true,
        downloadSupported: true,
      },
    ],
  } as any);
  vi.spyOn(novelApi, "search").mockResolvedValue({
    keyword: "小说",
    page: 1,
    results: [{ name: book.name, author: book.author, origins: [book] }],
    sources: [],
    totalSources: 1,
    completedSources: 1,
  } as any);
  vi.spyOn(novelApi, "catalog").mockResolvedValue({
    tocComplete: true,
    tocPages: 1,
    chapters: [{ title: "第一章", url: "https://novel.test/1" }],
  } as any);
  vi.spyOn(novelApi, "download").mockResolvedValue(novelTask("completed", 5) as any);
  vi.mocked(novelApi.tasks).mockResolvedValue([novelTask("completed", 5)]);
  await click('.sidebar [aria-label="小说搜索"]');
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="书名或作者"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "小说");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await click('[aria-label="查看 统一下载的小说 的详情"]');
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("dialog button")]
      .find((x) => x.textContent === "下载所选范围")!
      .click(),
  );
  expect(window.location.hash).toBe("#downloads");
  expect(container.querySelector("h1")?.textContent).toBe("下载任务");
  expect(container.querySelector('a[href$="/novel-task/txt"]')).not.toBeNull();
});
