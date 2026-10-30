import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../App.js";
import { authApi } from "../api/auth.js";
import { veneraApi } from "../api/venera.js";
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
  vi.spyOn(veneraApi, "health").mockResolvedValue({ ok: true, name: "test", dataDir: "/data" });
  vi.spyOn(veneraApi, "listInstalledSources").mockResolvedValue([
    { key: "mock", name: "Mock", hasSearch: true },
  ]);
  vi.spyOn(veneraApi, "listSourceMetadata").mockResolvedValue([
    { key: "mock", name: "Mock", enabled: true },
  ]);
  vi.spyOn(veneraApi, "listAvailableSources").mockResolvedValue([{ key: "mock", name: "Mock" }]);
  vi.spyOn(veneraApi, "getSourceAuth").mockResolvedValue({
    loggedIn: false,
    methods: [],
    cookieFields: [],
    webview: "unsupported",
  });
  vi.spyOn(veneraApi, "getCacheStats").mockResolvedValue({ files: 0, bytes: 0 });
  vi.spyOn(veneraApi, "listDownloads").mockResolvedValue([task()]);
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
