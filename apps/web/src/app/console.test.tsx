import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell.js";
import type { TabKey } from "./navigation.js";
import { SearchResults } from "../features/search/SearchResults.js";
import { SourcesView } from "../features/sources/SourcesView.js";
import type { SourcesViewProps } from "../features/sources/types.js";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
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

it("keeps account and refresh actions reachable in settings after collapsing navigation, and persists the theme", async () => {
  const refresh = vi.fn();
  function Harness() {
    const [tab, setTab] = useState<TabKey>("search");
    return (
      <AppShell
        activeTab={tab}
        onTabChange={setTab}
        busy={false}
        error={null}
        health={{ ok: true, name: "test", dataDir: "/data" }}
        downloadCount={2}
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
  await click(container.querySelector('.sidebar [aria-label="系统设置"]'));
  expect(container.querySelector("main")?.textContent).toContain("账号设置入口");
  expect(container.querySelector("main")?.textContent).not.toContain("搜索页面");
  await click(button("刷新状态"));
  expect(refresh).toHaveBeenCalledOnce();
  await click(button("切换主题"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.setItem).toHaveBeenCalledWith("venera:theme", "dark");
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

it("opens the selected source configuration without mixing it with repository installation", async () => {
  const changeSource = vi.fn();
  const enabled = vi.fn();
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
      installSource: "",
      availableSources: [],
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
      onInstallSourceChange: vi.fn(),
      onSettingsJsonChange: vi.fn(),
      onCookieUrlChange: vi.fn(),
      onCookieTextChange: vi.fn(),
      onInstallSelectedSource: vi.fn(),
      onRefreshRepository: vi.fn(),
      onUpdateSource: vi.fn(),
      onReloadSources: vi.fn(),
      onLoadSourceSettings: vi.fn(),
      onSaveSourceSettings: vi.fn(),
      onResetSourceSettings: vi.fn(),
      onImportCookies: vi.fn(),
      onClearCookies: vi.fn(),
    };
    return <SourcesView {...props} />;
  }
  await render(<Harness />);
  const cards = container.querySelectorAll(".installed-source-grid article");
  await click(cards[1]?.querySelector(".source-actions button"));
  expect(changeSource).toHaveBeenCalledWith("b");
  expect(container.querySelector<HTMLSelectElement>(".current-source-panel select")?.value).toBe(
    "b",
  );
  expect(container.querySelector(".current-source-panel")?.closest("details")?.open).toBe(true);
  expect(container.querySelector("details")?.open).toBe(false);
  expect(container.querySelector(".current-source-panel")?.textContent).toContain("Cookie：b");
  await click(cards[1]?.querySelector('[role="switch"]'));
  expect(enabled).toHaveBeenCalledWith(metadata[1], true);
});
