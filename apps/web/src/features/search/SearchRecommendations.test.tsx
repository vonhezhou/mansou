import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";
import { mansouApi } from "../../api/mansou.js";
import { SearchRecommendations } from "./SearchRecommendations.js";

type Groups = Awaited<ReturnType<typeof mansouApi.searchRecommendations>>;
type Props = Parameters<typeof SearchRecommendations>[0];
const sources = ["a", "b", "unsupported"].map((key) => ({
  key,
  name: key.toUpperCase(),
  hasSearch: true,
  hasSearchRecommendations: key !== "unsupported",
}));
const groups = (keyword: string, count = 1): Groups => [
  {
    id: "0",
    title: "推荐标签",
    random: false,
    limit: 12,
    items: Array.from({ length: count }, (_, i) => ({
      label: `${keyword}${i}`,
      keyword: `${keyword}${i}`,
      target: { page: "search", attributes: { keyword: `${keyword}${i}` } },
    })),
  },
];
let root: Root;
let container: HTMLDivElement;
let props: Props;
let load: MockInstance<typeof mansouApi.searchRecommendations>;
const render = async (changes: Partial<Props> = {}) => {
  props = { ...props, ...changes };
  await act(async () => root.render(<SearchRecommendations {...props} />));
};
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === text,
  )!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  props = {
    sources,
    sourceKey: "a",
    searchMode: "single",
    aggregateSourceKeys: ["a", "b"],
    onSelect: vi.fn(),
  };
  load = vi.spyOn(mansouApi, "searchRecommendations").mockResolvedValue(groups("词"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("loads only the current source, limits initial terms and passes the selected keyword", async () => {
  load.mockResolvedValue(groups("词", 15));
  await render();
  expect(load).toHaveBeenCalledTimes(1);
  expect(load.mock.calls[0]![0]).toBe("a");
  expect(container.querySelectorAll(".recommendation-term")).toHaveLength(12);
  await act(async () => button("词0").click());
  expect(props.onSelect).toHaveBeenCalledWith("词0");
  await act(async () => button("展开更多").click());
  expect(container.querySelectorAll(".recommendation-term")).toHaveLength(15);
  expect(load).toHaveBeenCalledTimes(1);
});

it("changes the aggregate term source without mutating search selections", async () => {
  load.mockImplementation(async (key) => groups(key));
  await render({ searchMode: "aggregate" });
  const select = container.querySelector("select")!;
  await act(async () => {
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(button("b0")).toBeDefined();
  expect(props.sourceKey).toBe("a");
  expect(props.aggregateSourceKeys).toEqual(["a", "b"]);
  expect(props.onSelect).not.toHaveBeenCalled();
  await render({ aggregateSourceKeys: ["a"] });
  expect(container.querySelector("select")!.value).toBe("a");
  expect(button("a0")).toBeDefined();
});

it("counts actual random items toward the twelve-term initial limit", async () => {
  load.mockResolvedValue([
    ...groups("随机", 3).map((group) => ({ ...group, random: true })),
    ...groups("固定", 15).map((group) => ({ ...group, id: "1" })),
  ]);
  await render();
  expect(container.querySelectorAll(".recommendation-term")).toHaveLength(12);
  expect(button("固定8")).toBeDefined();
  expect(button("固定9")).toBeUndefined();
});

it("ignores late responses and aborts the old request on a source change", async () => {
  let resolve!: (value: Groups) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  const signal = load.mock.calls[0]![1]!;
  await render({ sourceKey: "b" });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(groups("旧词")));
  expect(container.textContent).not.toContain("旧词");
  expect(button("词0")).toBeDefined();
});

it("keeps loading errors local and retries explicitly", async () => {
  load.mockRejectedValueOnce(new Error("源暂时不可用"));
  await render();
  expect(container.textContent).toContain("推荐词加载失败：源暂时不可用");
  expect(props.onSelect).not.toHaveBeenCalled();
  await act(async () => button("重试").click());
  expect(button("词0")).toBeDefined();
  expect(container.textContent).not.toContain("加载失败");
});

it("shuffles locally and refreshes from the source only on request", async () => {
  load.mockResolvedValue(groups("词", 8).map((group) => ({ ...group, random: true, limit: 3 })));
  await render();
  expect(container.querySelectorAll(".recommendation-term")).toHaveLength(3);
  await act(async () => button("换一批").click());
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => button("刷新").click());
  expect(load).toHaveBeenCalledTimes(2);
});

it("hides unsupported sources and keeps the aggregate selector available for an empty dynamic group", async () => {
  await render({ sourceKey: "unsupported" });
  expect(load).not.toHaveBeenCalled();
  expect(container.textContent).toBe("");
  load.mockResolvedValue([]);
  await render({ sourceKey: "a" });
  expect(container.textContent).toBe("");
  await render({ searchMode: "aggregate" });
  expect(container.querySelector("select")).not.toBeNull();
  expect(container.textContent).toContain("暂无可用");
});
