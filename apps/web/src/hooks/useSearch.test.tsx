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
function Harness() {
  state = useSearch({
    runWith: async (setLoading, task) => {
      setLoading(true);
      try {
        await task();
      } finally {
        setLoading(false);
      }
    },
    sourceKey: "search-source",
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
  expect(pages).toHaveBeenCalledWith("detail-source", "comic", "chapter");
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
