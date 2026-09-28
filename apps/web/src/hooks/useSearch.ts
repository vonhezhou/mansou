import { startTransition, useState } from "react";
import type { Comic } from "@venera/contracts";
import { veneraApi } from "../api/venera.js";
import type { AggregatedSearchItem, Details, Source } from "../types.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

type UseSearchOptions = {
  runWith: RunWith;
  sourceKey: string;
  detailSourceKey: string;
  setSourceKey: (value: string) => void;
  setDetailSourceKey: (value: string) => void;
  setActiveTab: (value: "search" | "downloads" | "sources") => void;
  loadDownloads: () => Promise<void>;
};

export function useSearch(options: UseSearchOptions) {
  const [keyword, setKeyword] = useState("test");
  const [searchMode, setSearchMode] = useState<"single" | "aggregate">("single");
  const [aggregateSourceKeys, setAggregateSourceKeys] = useState<string[]>([]);
  const [aggregateResultLayout, setAggregateResultLayout] = useState<"grouped" | "flat">("grouped");
  const [results, setResults] = useState<Comic[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedSearchItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchNext, setSearchNext] = useState<string | null>(null);
  const [searchMaxPage, setSearchMaxPage] = useState<number | undefined>();
  const [hasSearched, setHasSearched] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [episodePageCounts, setEpisodePageCounts] = useState<Record<string, number>>({});
  const [downloadCreateStatus, setDownloadCreateStatus] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [previewingChapter, setPreviewingChapter] = useState(false);
  const [countingPages, setCountingPages] = useState(false);
  const [creatingDownload, setCreatingDownload] = useState(false);

  function syncAggregateSources(sources: Source[]) {
    setAggregateSourceKeys((current) =>
      current.length
        ? current.filter((key) => sources.some((source) => source.key === key))
        : sources
            .filter((source) => source.hasSearch)
            .slice(0, 1)
            .map((source) => source.key),
    );
  }

  async function search() {
    await options.runWith(setSearching, async () => {
      const data = await veneraApi.search(options.sourceKey, keyword, { page: 1 });
      startTransition(() => {
        setResults(data.comics ?? []);
        setAggregatedResults([]);
        setSearchPage(1);
        setSearchNext(data.next ?? null);
        setSearchMaxPage(data.maxPage);
        setHasSearched(true);
        setDetails(null);
        setPreviewImages([]);
      });
    });
  }

  async function aggregatedSearch() {
    await options.runWith(setSearching, async () => {
      const data = await veneraApi.aggregatedSearch(keyword, aggregateSourceKeys);
      startTransition(() => {
        setAggregatedResults(data);
        setResults([]);
        setSearchPage(1);
        setSearchNext(null);
        setSearchMaxPage(undefined);
        setHasSearched(true);
        setDetails(null);
        setPreviewImages([]);
      });
    });
  }

  async function submitSearch() {
    if (searchMode === "aggregate") await aggregatedSearch();
    else await search();
  }

  async function loadMoreResults() {
    await options.runWith(setSearching, async () => {
      const nextPage = searchPage + 1;
      const data = await veneraApi.search(
        options.sourceKey,
        keyword,
        searchNext ? { next: searchNext } : { page: nextPage },
      );
      startTransition(() => {
        setResults((current) => [...current, ...(data.comics ?? [])]);
        setSearchPage(nextPage);
        setSearchNext(data.next ?? null);
        setSearchMaxPage(data.maxPage);
      });
    });
  }

  async function openComic(comic: Comic, nextSourceKey = options.sourceKey) {
    await options.runWith(setLoadingDetails, async () => {
      const data = await veneraApi.comicDetails(nextSourceKey, comic.id);
      const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
      options.setSourceKey(nextSourceKey);
      options.setDetailSourceKey(nextSourceKey);
      setDetails(data);
      setEpisodeId(firstEpisode);
      setSelectedEpisodeIds([]);
      setEpisodePageCounts({});
      setPreviewImages([]);
      try {
        const pages = await veneraApi.episodePages(
          nextSourceKey,
          data.comicId ?? data.id,
          firstEpisode,
        );
        setPreviewImages(pages.images ?? []);
        setEpisodePageCounts({ [firstEpisode]: pages.images?.length ?? 0 });
      } catch {
        // 详情仍然可用；部分源只能在用户完成登录或设置后返回章节图片。
      }
    });
  }

  async function previewEpisode(nextEpisodeId = episodeId) {
    if (!details || !nextEpisodeId) return;
    await options.runWith(setPreviewingChapter, async () => {
      const data = await veneraApi.episodePages(
        options.detailSourceKey,
        details.comicId ?? details.id,
        nextEpisodeId,
      );
      setEpisodeId(nextEpisodeId);
      setPreviewImages(data.images ?? []);
      setEpisodePageCounts((current) => ({
        ...current,
        [nextEpisodeId]: data.images?.length ?? 0,
      }));
    });
  }

  async function countAllPages() {
    if (!details) return;
    const chapterIds = Object.keys(details.chapters ?? {});
    if (chapterIds.length === 0) return;
    await options.runWith(setCountingPages, async () => {
      const nextCounts = { ...episodePageCounts };
      for (const chapterId of chapterIds) {
        if (nextCounts[chapterId] !== undefined) continue;
        try {
          const pages = await veneraApi.episodePages(
            options.detailSourceKey,
            details.comicId ?? details.id,
            chapterId,
          );
          nextCounts[chapterId] = pages.images?.length ?? 0;
          setEpisodePageCounts({ ...nextCounts });
        } catch {
          // 单章失败不应阻断已可统计的章节，也不把不完整结果伪装成总页数。
        }
      }
    });
  }

  async function createDownload(mode: "first" | "selected" | "all") {
    if (!details) return;
    await options.runWith(setCreatingDownload, async () => {
      const comicId = details.comicId ?? details.id;
      const firstEpisode = Object.keys(details.chapters ?? {})[0] ?? "_default";
      const episodeIds = mode === "selected" ? selectedEpisodeIds : [firstEpisode];
      const requests =
        mode === "all"
          ? [{ sourceKey: options.detailSourceKey, comicId, all: true }]
          : episodeIds.map((id) => ({
              sourceKey: options.detailSourceKey,
              comicId,
              episodeId: id,
            }));
      let success = 0;
      let failed = 0;
      setDownloadCreateStatus(`创建中：0/${requests.length}`);
      for (const request of requests) {
        try {
          await veneraApi.createDownload(request);
          success += 1;
        } catch {
          failed += 1;
        }
        setDownloadCreateStatus(
          `创建中：${success + failed}/${requests.length}，成功 ${success}，失败 ${failed}`,
        );
      }
      setDownloadCreateStatus(`创建完成：成功 ${success}，失败 ${failed}`);
      options.setActiveTab("downloads");
      await options.loadDownloads();
    });
  }

  async function downloadComic(comic: Comic, nextSourceKey = options.sourceKey) {
    await options.runWith(setCreatingDownload, async () => {
      await veneraApi.createDownload({ sourceKey: nextSourceKey, comicId: comic.id, all: true });
      options.setActiveTab("downloads");
      await options.loadDownloads();
    });
  }

  function toggleAggregateSource(source: string) {
    setAggregateSourceKeys((current) =>
      current.includes(source) ? current.filter((key) => key !== source) : [...current, source],
    );
  }

  function toggleSelectedEpisode(id: string) {
    setSelectedEpisodeIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function selectEpisodes(action: "all" | "clear" | "invert") {
    const ids = Object.keys(details?.chapters ?? {});
    if (action === "all") setSelectedEpisodeIds(ids);
    if (action === "clear") setSelectedEpisodeIds([]);
    if (action === "invert")
      setSelectedEpisodeIds((current) => ids.filter((id) => !current.includes(id)));
  }

  const canLoadMore =
    Boolean(searchNext) || (searchMaxPage !== undefined && searchPage < searchMaxPage);
  const searchBusy =
    searching || loadingDetails || previewingChapter || countingPages || creatingDownload;

  return {
    aggregateResultLayout,
    aggregateSourceKeys,
    aggregatedResults,
    canLoadMore,
    details,
    downloadCreateStatus,
    episodePageCounts,
    episodeId,
    hasSearched,
    keyword,
    previewImages,
    results,
    searchBusy,
    searchMaxPage,
    searchMode,
    searchPage,
    selectedEpisodeIds,
    setAggregateResultLayout,
    setKeyword,
    setSearchMode,
    syncAggregateSources,
    submitSearch,
    loadMoreResults,
    openComic,
    previewEpisode,
    createDownload,
    countAllPages,
    downloadComic,
    toggleAggregateSource,
    toggleSelectedEpisode,
    selectEpisodes,
  };
}
