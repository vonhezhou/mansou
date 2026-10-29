import { startTransition, useRef, useState } from "react";
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
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"single" | "aggregate">("single");
  const [aggregateSourceKeys, setAggregateSourceKeys] = useState<string[]>([]);
  const [aggregateResultLayout, setAggregateResultLayout] = useState<"grouped" | "flat">("flat");
  const [results, setResults] = useState<Comic[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedSearchItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<{
    sourceKey: string;
    keyword: string;
    mode: "single" | "aggregate";
  } | null>(null);
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
  const [pendingComic, setPendingComic] = useState<{ comic: Comic; sourceKey: string } | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef(0);
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
    const query = {
      sourceKey: options.sourceKey,
      keyword: keyword.trim(),
      mode: "single" as const,
    };
    if (!query.keyword) return;
    await options.runWith(setSearching, async () => {
      const data = await veneraApi.search(query.sourceKey, query.keyword, { page: 1 });
      startTransition(() => {
        setSearchQuery(query);
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
    const query = {
      sourceKey: options.sourceKey,
      keyword: keyword.trim(),
      mode: "aggregate" as const,
    };
    if (!query.keyword || aggregateSourceKeys.length === 0) return;
    await options.runWith(setSearching, async () => {
      const data = await veneraApi.aggregatedSearch(query.keyword, aggregateSourceKeys);
      startTransition(() => {
        setSearchQuery(query);
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
    if (!searchQuery || searchQuery.mode !== "single" || !canLoadMore) return;
    await options.runWith(setSearching, async () => {
      const nextPage = searchPage + 1;
      const data = await veneraApi.search(
        searchQuery.sourceKey,
        searchQuery.keyword,
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
    const request = ++detailRequest.current;
    setPendingComic({ comic, sourceKey: nextSourceKey });
    setDetailError(null);
    setDetails(null);
    setPreviewImages([]);
    options.setDetailSourceKey(nextSourceKey);
    await options.runWith(
      (loading) => {
        if (request === detailRequest.current) setLoadingDetails(loading);
      },
      async () => {
        try {
          const data = await veneraApi.comicDetails(nextSourceKey, comic.id);
          // 关闭弹窗或打开另一本漫画后，旧请求不能重新打开或覆盖详情。
          if (request !== detailRequest.current) return;
          const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
          setDetails(data);
          setEpisodeId(firstEpisode);
          setSelectedEpisodeIds([]);
          setEpisodePageCounts({});
          setDownloadCreateStatus(null);
          setPendingComic(null);
        } catch (error) {
          if (request !== detailRequest.current) return;
          setDetailError(error instanceof Error ? error.message : String(error));
        }
      },
    );
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
      if (failed === 0) {
        setDetails(null);
        setPreviewImages([]);
        options.setActiveTab("downloads");
      }
      await options.loadDownloads();
    });
  }

  function closeDetails() {
    detailRequest.current++;
    setLoadingDetails(false);
    setPendingComic(null);
    setDetailError(null);
    setDetails(null);
    setPreviewImages([]);
    setDownloadCreateStatus(null);
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
    pendingComic,
    detailError,
    loadingDetails,
    downloadCreateStatus,
    episodePageCounts,
    episodeId,
    hasSearched,
    keyword,
    previewImages,
    results,
    searchBusy,
    searchMaxPage,
    searchQuery,
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
    closeDetails,
    toggleAggregateSource,
    toggleSelectedEpisode,
    selectEpisodes,
  };
}
