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
