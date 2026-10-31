import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mansouApi } from "../api/mansou.js";
import { AppShell } from "./AppShell.js";
import type { TabKey } from "./navigation.js";
import { SearchResults } from "../features/search/SearchResults.js";
import { SourcesView } from "../features/sources/SourcesView.js";
import type { SourcesViewProps } from "../features/sources/types.js";
import { createDownloadSnapshotStore } from "../lib/downloadSnapshot.js";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  document.documentElement.dataset.theme = "light";
  vi.stubGlobal("localStorage", { setItem: vi.fn() });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(element: ReactElement) {
  await act(async () => root.render(element));
}
async function click(button: Element | null | undefined) {
  expect(button).toBeTruthy();
  await act(async () => (button as HTMLButtonElement).click());
}
function button(label: string) {
  return [...container.querySelectorAll("button")].find((item) => item.textContent === label);
}

it("opens settings from the server profile after collapsing navigation, keeps account and refresh reachable, and persists the theme", async () => {
  const refresh = vi.fn();
  const downloadStore = createDownloadSnapshotStore();
  downloadStore.setSnapshot(
    ["queued", "running"].map((status, index) => ({
      id: String(index),
      sourceKey: "mock",
      comicId: "comic",
      status,
      phase: status,
      total: 0,
      completed: 0,
    })),
  );
  function Harness() {
    const [tab, setTab] = useState<TabKey>("search");
    return (
      <AppShell
        activeTab={tab}
        onTabChange={setTab}
        busy={false}
        error={null}
        health={{ ok: true, name: "test", dataDir: "/data" }}
        downloadStore={downloadStore}
        sourceCount={4}
        onRefresh={refresh}
        account={<button>账号设置入口</button>}
      >
        <p>搜索页面</p>
      </AppShell>
    );
  }
  await render(<Harness />);
  await click(container.querySelector('[aria-label="收起侧边栏"]'));
  await click(container.querySelector('.sidebar [aria-label="管理与切换漫搜服务器"]'));
  expect(container.querySelector("main")?.textContent).toContain("账号设置入口");
  expect(container.querySelector("main")?.textContent).not.toContain("搜索页面");
  await click(button("刷新状态"));
  expect(refresh).toHaveBeenCalledOnce();
  await click(button("切换主题"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.setItem).toHaveBeenCalledWith("mansou:theme", "dark");
});

it("preserves the originating source when switching between grouped, flat and list results with duplicate comic IDs", async () => {
  const open = vi.fn();
  function Harness() {
    const [layout, setLayout] = useState<"grouped" | "flat">("grouped");
    return (
      <SearchResults
        busy={false}
        sourceKey="a"
        searchMode="aggregate"
        aggregateResultLayout={layout}
        onAggregateResultLayoutChange={setLayout}
        results={[]}
        aggregatedResults={["a", "b"].map((key) => ({
          sourceKey: key,
          sourceName: key,
          result: { comics: [{ id: "same", title: `漫画 ${key}` }] },
        }))}
        hasSearched
        searchPage={1}
        canLoadMore={false}
        onLoadMore={vi.fn()}
        onOpenComic={open}
      />
    );
  }
  await render(<Harness />);
  await click(button("全部平铺"));
  await click(container.querySelector('[aria-label="列表视图"]'));
  expect(container.querySelectorAll(".comic-card")).toHaveLength(2);
  await click(container.querySelector('[aria-label="查看 漫画 b 的详情"]'));
  expect(open).toHaveBeenCalledWith({ id: "same", title: "漫画 b" }, "b");
  await click(button("按源分组"));
  expect(container.querySelectorAll(".comic-card")).toHaveLength(2);
});

it("distinguishes failed and cancelled searches from an empty successful search", async () => {
  const props = {
    busy: false,
    sourceKey: "mock",
    searchMode: "single" as const,
    aggregateResultLayout: "flat" as const,
    results: [],
    aggregatedResults: [],
    hasSearched: true,
    searchPage: 1,
    canLoadMore: false,
    onAggregateResultLayoutChange: vi.fn(),
    onLoadMore: vi.fn(),
    onOpenComic: vi.fn(),
  };
  await render(<SearchResults {...props} searchError="连接超时" />);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("连接超时");
  expect(container.textContent).not.toContain("没有找到结果");
  await render(<SearchResults {...props} searchCancelled />);
  expect(container.textContent).toContain("搜索已停止");
  expect(container.textContent).not.toContain("没有找到结果");
  await render(<SearchResults {...props} />);
  expect(container.textContent).toContain("没有找到结果");
});

it.each(["flat", "grouped"] as const)(
  "keeps failed source details separate from usable %s results",
  async (layout) => {
    const props = {
      busy: false,
      sourceKey: "a",
      searchMode: "aggregate" as const,
      aggregateResultLayout: layout,
      results: [],
      aggregatedResults: [
        { sourceKey: "a", sourceName: "源 A", error: "请检查 Cookie" },
        { sourceKey: "b", sourceName: "源 B", error: "连接超时" },
        {
          sourceKey: "c",
          sourceName: "源 C",
          result: { comics: [{ id: "1", title: "可用漫画" }] },
        },
      ],
      hasSearched: true,
      searchPage: 1,
      canLoadMore: false,
      onAggregateResultLayoutChange: vi.fn(),
      onLoadMore: vi.fn(),
      onOpenComic: vi.fn(),
    };
    await render(<SearchResults {...props} />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("2 个源搜索失败");
    expect(details.querySelector("summary")?.textContent).toContain("已有结果仍可正常查看");
    expect(details.querySelectorAll("li")).toHaveLength(2);
    expect(details.textContent).toContain("请检查 Cookie");
    expect(details.textContent).toContain("连接超时");
    expect(container.querySelectorAll(".comic-card")).toHaveLength(1);
    expect(container.querySelector(".aggregate-source header")?.textContent ?? "").not.toContain(
      "请检查 Cookie",
    );

    await render(
      <SearchResults {...props} aggregatedResults={props.aggregatedResults.slice(0, 2)} />,
    );
    expect(container.textContent).not.toContain("没有找到结果");
    expect(container.textContent).toContain("可稍后重试，或更换漫画源");

    await render(<SearchResults {...props} aggregatedResults={[props.aggregatedResults[2]]} />);
    expect(container.querySelector("details")).toBeNull();
  },
);

it("opens the selected source configuration without mixing it with repository installation", async () => {
  vi.spyOn(mansouApi, "getSourceRepository").mockResolvedValue({
    subscriptions: [],
    sources: [],
  });
  const changeSource = vi.fn();
  const install = vi.fn();
  const enabled = vi.fn();
  const importCookies = vi.fn();
  const loadSettings = vi.fn();
  const metadata = [
    { key: "a", name: "源 A", enabled: true },
    { key: "b", name: "源 B", enabled: false },
  ];
  function Harness() {
    const [key, setKey] = useState("a");
    const props: SourcesViewProps = {
      busy: false,
      sourceKey: key,
      sourceMetadata: metadata,
      availableSources: [{ key: "c", name: "仓库源 C", fileName: "variant-c.js" }],
      sourceSettings: null,
      sourceSettingsKey: "",
      settingsJson: "{}",
      cookieUrl: "",
      cookieText: "",
      onSourceChange: (value) => {
        changeSource(value);
        setKey(value);
      },
      onSetSourceEnabled: enabled,
      onSettingsJsonChange: vi.fn(),
      onCookieUrlChange: vi.fn(),
      onCookieTextChange: vi.fn(),
      onInstallSource: install,
      onUninstallSource: vi.fn(),
      onRepositorySaved: vi.fn(),
      onRefreshRepository: vi.fn(),
      onUpdateSource: vi.fn(),
      onReloadSources: vi.fn(),
      onLoadSourceSettings: loadSettings,
      onSaveSourceSettings: vi.fn(),
      onResetSourceSettings: vi.fn(),
      onImportCookies: importCookies,
      onClearCookies: vi.fn(),
    };
    return <SourcesView {...props} />;
  }
  await render(<Harness />);
  const cards = container.querySelectorAll(".installed-source-grid article");
  await click(cards[1]?.querySelector(".source-actions button"));
  expect(changeSource).toHaveBeenCalledWith("b");
  expect(container.querySelector(".current-source-panel select")).toBeNull();
  expect(container.querySelector(".current-source-panel")?.closest("dialog")?.open).toBe(true);
  expect(container.querySelector(".repository-panel")).toBeNull();
  expect(container.querySelector(".current-source-panel")?.textContent).toContain("此源已禁用");
  expect(container.querySelector(".current-source-panel")?.textContent).not.toContain("Cookie：b");
  await click(cards[1]?.querySelector('[role="switch"]'));
  expect(enabled).toHaveBeenCalledWith(metadata[1], true);
  await click(container.querySelector('[aria-label="关闭源 B · 源设置与账号"]'));
  await click(cards[0]?.querySelectorAll(".source-actions button")[1]);
  expect(changeSource).toHaveBeenLastCalledWith("a");
  expect(loadSettings).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")?.textContent).toContain("Cookie：a");
  expect(container.querySelector("dialog form")).toBeNull();
  await click(container.querySelector('[aria-label="关闭源 A · Cookie"]'));
  await click(button("管理订阅"));
  await click(button("添加订阅"));
  expect(container.querySelector("dialog")?.textContent).toContain("订阅地址");
  await click(container.querySelector('[aria-label="关闭管理漫画源订阅"]'));
  await click(button("安装漫画源"));
  expect(container.querySelector<HTMLDialogElement>("dialog")?.open).toBe(true);
  expect(container.querySelector(".repository-panel")?.closest("dialog")).not.toBeNull();
  await click(container.querySelector(".repository-source-card button"));
  expect(install).toHaveBeenCalledWith("variant-c.js");
  await click(container.querySelector('[aria-label="关闭安装漫画源"]'));
  expect(container.querySelector(".repository-panel")).toBeNull();
});
