import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSearch } from "./useSearch.js";
import { veneraApi } from "../api/venera.js";

let state: ReturnType<typeof useSearch>;
let root: Root;
let container: HTMLDivElement;
const navigate = vi.fn();
const changeSource = vi.fn();
function Harness({ sourceKey = "search-source" }: { sourceKey?: string }) {
  state = useSearch({
    runWith: async (setLoading, task) => {
      setLoading(true);
      try {
        await task();
      } finally {
        setLoading(false);
      }
    },
    sourceKey,
    detailSourceKey: "detail-source",
    setSourceKey: changeSource,
    setDetailSourceKey: vi.fn(),
    setActiveTab: navigate,
    loadDownloads: async () => {},
  });
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("opens details without loading chapter images or changing the search source", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "comic",
    title: "漫画",
    chapters: { chapter: "第一章" },
  });
  const pages = vi.spyOn(veneraApi, "episodePages").mockResolvedValue({ images: ["page.jpg"] });
  await act(async () => state.openComic({ id: "comic", title: "漫画" }, "detail-source"));
  expect(state.details?.id).toBe("comic");
  expect(pages).not.toHaveBeenCalled();
  expect(changeSource).not.toHaveBeenCalled();
  await act(async () => state.previewEpisode("chapter"));
  expect(pages).toHaveBeenCalledWith("detail-source", "comic", "chapter", expect.any(AbortSignal));
  expect(state.previewImages).toEqual(["page.jpg"]);
  await act(async () => state.closeDetails());
  expect(state.details).toBeNull();
  expect(state.previewImages).toEqual([]);
});
it("clears detail state when navigating to downloads so it cannot reopen on return", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "comic",
    title: "漫画",
    chapters: { chapter: "第一章" },
  });
  vi.spyOn(veneraApi, "createDownload").mockResolvedValue({ id: "task" } as Awaited<
    ReturnType<typeof veneraApi.createDownload>
  >);
  await act(async () => state.openComic({ id: "comic", title: "漫画" }, "detail-source"));
  await act(async () => state.createDownload("all"));
  expect(navigate).toHaveBeenCalledWith("downloads");
  expect(state.details).toBeNull();
});

it("keeps failed downloads visible in the detail dialog", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "comic",
    title: "漫画",
    chapters: { chapter: "第一章" },
  });
  vi.spyOn(veneraApi, "createDownload").mockRejectedValue(new Error("下载失败"));
  await act(async () => state.openComic({ id: "comic", title: "漫画" }, "detail-source"));
  await act(async () => state.createDownload("all"));
  expect(navigate).not.toHaveBeenCalled();
  expect(state.details?.id).toBe("comic");
  expect(state.downloadCreateStatus).toContain("失败 1");
});

it("shows pending details immediately and ignores a response after the dialog is closed", async () => {
  const response = deferred<Awaited<ReturnType<typeof veneraApi.comicDetails>>>();
  vi.spyOn(veneraApi, "comicDetails").mockReturnValue(response.promise);
  let opening: Promise<void>;
  await act(async () => {
    opening = state.openComic({ id: "slow", title: "慢请求" });
  });
  expect(state.pendingComic?.comic.title).toBe("慢请求");
  expect(state.loadingDetails).toBe(true);
  await act(async () => state.closeDetails());
  expect(state.pendingComic).toBeNull();
  expect(state.searchBusy).toBe(false);
  await act(async () => {
    response.resolve({ id: "slow", title: "慢请求" });
    await opening;
  });
  expect(state.details).toBeNull();
});

it("keeps a failed detail dialog available for retry without showing an old request over the new one", async () => {
  const older = deferred<Awaited<ReturnType<typeof veneraApi.comicDetails>>>();
  const newer = deferred<Awaited<ReturnType<typeof veneraApi.comicDetails>>>();
  const load = vi
    .spyOn(veneraApi, "comicDetails")
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise)
    .mockResolvedValue({ id: "new", title: "新漫画" });
  let first: Promise<void>;
  let second: Promise<void>;
  await act(async () => {
    first = state.openComic({ id: "old", title: "旧漫画" });
  });
  await act(async () => state.closeDetails());
  await act(async () => {
    second = state.openComic({ id: "new", title: "新漫画" });
  });
  await act(async () => {
    older.resolve({ id: "old", title: "旧漫画" });
    await first;
  });
  expect(state.loadingDetails).toBe(true);
  expect(state.details).toBeNull();
  await act(async () => {
    newer.reject(new Error("漫画源暂时限制访问"));
    await second;
  });
  expect(state.detailError).toBe("漫画源暂时限制访问");
  expect(state.pendingComic?.comic.id).toBe("new");
  expect(state.loadingDetails).toBe(false);
  await act(async () => state.openComic(state.pendingComic!.comic, state.pendingComic!.sourceKey));
  expect(load).toHaveBeenCalledTimes(3);
  expect(state.details?.id).toBe("new");
  expect(state.detailError).toBeNull();
  expect(state.pendingComic).toBeNull();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("loads more using the submitted keyword and source after the controls change", async () => {
  const search = vi
    .spyOn(veneraApi, "search")
    .mockResolvedValueOnce({ comics: [{ id: "one", title: "第一本" }], maxPage: 2 })
    .mockResolvedValueOnce({ comics: [{ id: "two", title: "第二本" }], maxPage: 2 });
  await act(async () => state.setKeyword("  原关键词  "));
  await act(async () => state.submitSearch());
  await act(async () => state.setKeyword("未提交的新词"));
  await act(async () => root.render(<Harness sourceKey="another-source" />));
  await act(async () => state.loadMoreResults());
  expect(search).toHaveBeenNthCalledWith(
    2,
    "search-source",
    "原关键词",
    { page: 2 },
    expect.any(AbortSignal),
  );
  expect(state.searchQuery).toEqual({
    keyword: "原关键词",
    sourceKey: "search-source",
    mode: "single",
  });
  expect(state.results.map((comic) => comic.id)).toEqual(["one", "two"]);
});

it("does not issue a blank search", async () => {
  const search = vi.spyOn(veneraApi, "search");
  await act(async () => state.setKeyword("   "));
  await act(async () => state.submitSearch());
  expect(search).not.toHaveBeenCalled();
});

it("publishes aggregate results as each source finishes and isolates source failures", async () => {
  const fast = deferred<Awaited<ReturnType<typeof veneraApi.search>>>();
  const slow = deferred<Awaited<ReturnType<typeof veneraApi.search>>>();
  vi.spyOn(veneraApi, "search").mockImplementation((key) =>
    key === "fast" ? fast.promise : slow.promise,
  );
  await act(async () => {
    state.setSearchMode("aggregate");
    state.setKeyword("漫画");
    state.toggleAggregateSource("fast");
    state.toggleAggregateSource("slow");
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = state.submitSearch();
  });
  await act(async () => fast.resolve({ comics: [{ id: "fast-comic", title: "快速结果" }] }));
  expect(state.aggregatedResults[0].result?.comics[0].id).toBe("fast-comic");
  expect(state.aggregatePendingKeys).toEqual(["slow"]);
  expect(state.searching).toBe(true);
  await act(async () => {
    slow.reject(new Error("源不可达"));
    await pending;
  });
  expect(state.aggregatedResults[1].error).toBe("源不可达");
  expect(state.aggregatedResults[0].result?.comics).toHaveLength(1);
  expect(state.searching).toBe(false);
});

it("aborts aggregate requests, preserves completed results and ignores late responses", async () => {
  const slow = deferred<Awaited<ReturnType<typeof veneraApi.search>>>();
  let signal: AbortSignal | undefined;
  vi.spyOn(veneraApi, "search").mockImplementation((key, _keyword, _cursor, requestSignal) => {
    signal = requestSignal;
    return key === "fast"
      ? Promise.resolve({ comics: [{ id: "fast", title: "已完成" }] })
      : slow.promise;
  });
  await act(async () => {
    state.setSearchMode("aggregate");
    state.setKeyword("漫画");
    state.toggleAggregateSource("fast");
    state.toggleAggregateSource("slow");
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = state.submitSearch();
  });
  await act(async () => state.cancelSearch());
  expect(signal?.aborted).toBe(true);
  expect(state.searching).toBe(false);
  expect(state.aggregatePendingKeys).toEqual([]);
  expect(state.aggregatedResults[0].result?.comics[0].id).toBe("fast");
  expect(state.aggregatedResults[1].cancelled).toBe(true);
  await act(async () => {
    slow.resolve({ comics: [{ id: "late", title: "迟到结果" }] });
    await pending;
  });
  expect(state.aggregatedResults[1].result).toBeUndefined();
});

it("limits aggregate concurrency and does not start queued sources after cancellation", async () => {
  const response = deferred<Awaited<ReturnType<typeof veneraApi.search>>>();
  const search = vi.spyOn(veneraApi, "search").mockReturnValue(response.promise);
  await act(async () => {
    state.setSearchMode("aggregate");
    state.setKeyword("漫画");
    for (const key of ["a", "b", "c", "d", "e"]) state.toggleAggregateSource(key);
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = state.submitSearch();
  });
  expect(search).toHaveBeenCalledTimes(3);
  await act(async () => state.cancelSearch());
  await act(async () => {
    response.resolve({ comics: [] });
    await pending;
  });
  expect(search).toHaveBeenCalledTimes(3);
});

it("stops chapter counting, preserves completed counts and does not request remaining chapters", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "book",
    title: "漫画",
    chapters: { a: "第一章", b: "第二章", c: "第三章" },
  });
  const pendingPages = deferred<Awaited<ReturnType<typeof veneraApi.episodePages>>>();
  const pages = vi
    .spyOn(veneraApi, "episodePages")
    .mockResolvedValueOnce({ images: ["one"] })
    .mockReturnValueOnce(pendingPages.promise);
  await act(async () => state.openComic({ id: "book", title: "漫画" }));
  let counting: Promise<void>;
  await act(async () => {
    counting = state.countAllPages();
  });
  expect(state.detailOperation).toContain("1/3");
  expect(pages).toHaveBeenCalledTimes(2);
  await act(async () => state.stopCounting());
  expect(pages.mock.calls[1][3]?.aborted).toBe(true);
  expect(state.countingPages).toBe(false);
  await act(async () => {
    pendingPages.resolve({ images: ["late"] });
    await counting;
  });
  expect(pages).toHaveBeenCalledTimes(2);
  expect(state.episodePageCounts).toEqual({ a: 1 });
  expect(state.detailSummary).toContain("统计已停止");
});

it("aborts a chapter preview on close and ignores its response after another comic opens", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "book",
    title: "漫画",
    chapters: { a: "第一章" },
  });
  const response = deferred<Awaited<ReturnType<typeof veneraApi.episodePages>>>();
  const pages = vi.spyOn(veneraApi, "episodePages").mockReturnValue(response.promise);
  await act(async () => state.openComic({ id: "book", title: "漫画" }));
  let preview: Promise<void>;
  await act(async () => {
    preview = state.previewEpisode("a");
  });
  expect(state.detailOperation).toContain("第一章");
  await act(async () => state.closeDetails());
  expect(pages.mock.calls[0][3]?.aborted).toBe(true);
  expect(state.detailsBusy).toBe(false);
  await act(async () => state.openComic({ id: "other", title: "另一本" }));
  await act(async () => {
    response.resolve({ images: ["old-page"] });
    await preview;
  });
  expect(state.previewImages).toEqual([]);
  expect(state.episodePageCounts).toEqual({});
});

it("counts failed chapters as failures and retries only the chapters still missing counts", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "book",
    title: "漫画",
    chapters: { a: "第一章", b: "第二章" },
  });
  const pages = vi
    .spyOn(veneraApi, "episodePages")
    .mockRejectedValueOnce(new Error("暂不可用"))
    .mockResolvedValueOnce({ images: ["b"] })
    .mockResolvedValueOnce({ images: ["a"] });
  await act(async () => state.openComic({ id: "book", title: "漫画" }));
  await act(async () => state.countAllPages());
  expect(state.episodePageCounts).toEqual({ b: 1 });
  expect(state.detailSummary).toContain("1 章失败");
  await act(async () => state.countAllPages());
  expect(pages.mock.calls.map((call) => call[2])).toEqual(["a", "b", "a"]);
  expect(state.episodePageCounts).toEqual({ a: 1, b: 1 });
});

it("exposes chapter preview errors in the detail state and clears them on a successful retry", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "book",
    title: "漫画",
    chapters: { a: "第一章" },
  });
  vi.spyOn(veneraApi, "episodePages")
    .mockRejectedValueOnce(new Error("源暂不可用"))
    .mockResolvedValueOnce({ images: [] });
  await act(async () => state.openComic({ id: "book", title: "漫画" }));
  await act(async () => state.previewEpisode("a"));
  expect(state.detailWorkError).toBe("源暂不可用");
  expect(state.detailsBusy).toBe(false);
  await act(async () => state.previewEpisode("a"));
  expect(state.detailWorkError).toBeNull();
  expect(state.detailSummary).toContain("暂未返回图片");
});

it("keeps creating requested downloads in the background without redirecting after the dialog closes", async () => {
  vi.spyOn(veneraApi, "comicDetails").mockResolvedValue({
    id: "book",
    title: "漫画",
    chapters: { a: "第一章" },
  });
  const response = deferred<Awaited<ReturnType<typeof veneraApi.createDownload>>>();
  vi.spyOn(veneraApi, "createDownload").mockReturnValue(response.promise);
  await act(async () => state.openComic({ id: "book", title: "漫画" }));
  let creating: Promise<void>;
  await act(async () => {
    creating = state.createDownload("all");
  });
  await act(async () => state.closeDetails());
  await act(async () => {
    response.resolve({ id: "task" } as Awaited<ReturnType<typeof veneraApi.createDownload>>);
    await creating;
  });
  expect(navigate).not.toHaveBeenCalled();
  expect(state.detailsBusy).toBe(false);
});
