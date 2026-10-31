import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../App.js";
import { authApi } from "../api/auth.js";
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
  vi.stubGlobal("EventSource", TestEventSource);
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
  const settings = [...container.querySelectorAll<HTMLDetailsElement>(".disclosure")].find(
    (element) => element.querySelector("summary")?.textContent?.includes("源设置与 Cookie"),
  )!;
  await act(async () => {
    settings.open = true;
    settings.dispatchEvent(new Event("toggle"));
  });
  expect(mansouApi.getSourceAuth).toHaveBeenCalledOnce();
  // 收起后保留已挂载内容，再展开不重复加载账号或丢失输入。
  await act(async () => {
    settings.open = false;
    settings.dispatchEvent(new Event("toggle"));
  });
  await act(async () => {
    settings.open = true;
    settings.dispatchEvent(new Event("toggle"));
  });
  expect(mansouApi.getSourceAuth).toHaveBeenCalledOnce();
  renders.sources.mockClear();
  const select = container.querySelector(".current-source-panel select");
  await snapshot("running", 30);
  await snapshot("paused", 30);
  expect(renders.sources).not.toHaveBeenCalled();
  expect(container.querySelector(".current-source-panel select")).toBe(select);
  expect(container.querySelector<HTMLSelectElement>(".current-source-panel select")?.value).toBe(
    "mock",
  );
});
