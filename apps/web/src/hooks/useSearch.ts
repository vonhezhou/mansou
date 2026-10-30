import { startTransition, useEffect, useRef, useState } from "react";
import type { Comic } from "@venera/contracts";
import { veneraApi } from "../api/venera.js";
import type { AggregatedSearchItem, Details, Source } from "../types.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

type UseSearchOptions = {
  runWith: RunWith;
  sourceKey: string;
  sources?: Source[];
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
  const [aggregatePendingKeys, setAggregatePendingKeys] = useState<string[]>([]);
  const searchController = useRef<AbortController | null>(null);
  const searchRequest = useRef(0);
  useEffect(
    () => () => {
      searchRequest.current++;
      searchController.current?.abort();
      previewController.current?.abort();
      countController.current?.abort();
      detailRequest.current++;
    },
    [],
  );

  async function runSearch(task: (signal: AbortSignal, request: number) => Promise<void>) {
    const request = ++searchRequest.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    await options.runWith(
      (loading) => {
        if (request === searchRequest.current) setSearching(loading);
      },
      async () => {
        try {
          await task(controller.signal, request);
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        } finally {
          if (request === searchRequest.current) {
            searchController.current = null;
            setAggregatePendingKeys([]);
          }
        }
      },
    );
  }

  function cancelSearch() {
    searchRequest.current++;
    searchController.current?.abort();
    searchController.current = null;
    setSearching(false);
    setAggregatePendingKeys([]);
    setAggregatedResults((current) =>
      current.map((item) => (!item.result && !item.error ? { ...item, cancelled: true } : item)),
    );
  }
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [pendingComic, setPendingComic] = useState<{ comic: Comic; sourceKey: string } | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const [previewingChapter, setPreviewingChapter] = useState(false);
  const [countingPages, setCountingPages] = useState(false);
  const [creatingDownload, setCreatingDownload] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [detailWorkError, setDetailWorkError] = useState<string | null>(null);
  const [previewEpisodeId, setPreviewEpisodeId] = useState<string | null>(null);
  const [countProgress, setCountProgress] = useState<{
    completed: number;
    total: number;
    failed: number;
    stopped?: boolean;
  } | null>(null);
  const previewController = useRef<AbortController | null>(null);
  const countController = useRef<AbortController | null>(null);

  function resetDetailWork() {
    previewController.current?.abort();
    countController.current?.abort();
    previewController.current = null;
    countController.current = null;
    setPreviewingChapter(false);
    setCountingPages(false);
    setCreatingDownload(false);
    setCountProgress(null);
    setPreviewSummary(null);
    setDetailWorkError(null);
  }

  function stopCounting() {
    countController.current?.abort();
    countController.current = null;
    setCountingPages(false);
    setCountProgress((current) => (current ? { ...current, stopped: true } : null));
  }

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
    await runSearch(async (signal, request) => {
      const data = await veneraApi.search(query.sourceKey, query.keyword, { page: 1 }, signal);
      if (request !== searchRequest.current) return;
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
    const keys = [...new Set(aggregateSourceKeys)];
    await runSearch(async (signal, request) => {
      setSearchQuery(query);
      setAggregatedResults(
        keys.map((sourceKey) => ({
          sourceKey,
          sourceName:
            options.sources?.find((source) => source.key === sourceKey)?.name ?? sourceKey,
        })),
      );
      setAggregatePendingKeys(keys);
      setResults([]);
      setSearchPage(1);
      setSearchNext(null);
      setSearchMaxPage(undefined);
      setHasSearched(true);
      setDetails(null);
      setPreviewImages([]);
      let nextSource = 0;
      async function worker() {
        while (nextSource < keys.length && !signal.aborted) {
          const sourceKey = keys[nextSource++];
          let patch: Pick<AggregatedSearchItem, "result" | "error">;
          try {
            patch = {
              result: await veneraApi.search(sourceKey, query.keyword, { page: 1 }, signal),
            };
          } catch (error) {
            if (signal.aborted) return;
            patch = { error: error instanceof Error ? error.message : String(error) };
          }
          if (request !== searchRequest.current || signal.aborted) return;
          startTransition(() =>
            setAggregatedResults((current) =>
              current.map((item) => (item.sourceKey === sourceKey ? { ...item, ...patch } : item)),
            ),
          );
          setAggregatePendingKeys((current) => current.filter((key) => key !== sourceKey));
        }
      }
      // 保留浏览器连接给详情、图片和 SSE，避免大量慢源占满所有连接。
      await Promise.all(Array.from({ length: Math.min(3, keys.length) }, () => worker()));
    });
  }

  async function submitSearch() {
    if (searchMode === "aggregate") await aggregatedSearch();
    else await search();
  }

  async function loadMoreResults() {
    if (!searchQuery || searchQuery.mode !== "single" || !canLoadMore) return;
    await runSearch(async (signal, request) => {
      const nextPage = searchPage + 1;
      const data = await veneraApi.search(
        searchQuery.sourceKey,
        searchQuery.keyword,
        searchNext ? { next: searchNext } : { page: nextPage },
        signal,
      );
      if (request !== searchRequest.current) return;
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
    resetDetailWork();
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
    const request = detailRequest.current;
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreviewEpisodeId(nextEpisodeId);
    setPreviewSummary(null);
    setDetailWorkError(null);
    setCountProgress(null);
    await options.runWith(
      (loading) => {
        if (request === detailRequest.current && previewController.current === controller)
          setPreviewingChapter(loading);
      },
      async () => {
        try {
          const data = await veneraApi.episodePages(
            options.detailSourceKey,
            details.comicId ?? details.id,
            nextEpisodeId,
            controller.signal,
          );
          if (controller.signal.aborted || request !== detailRequest.current) return;
          setEpisodeId(nextEpisodeId);
          setPreviewImages(data.images ?? []);
          setPreviewSummary(
            data.images?.length ? null : "该章节暂未返回图片，请稍后重试或更换章节。",
          );
          setEpisodePageCounts((current) => ({
            ...current,
            [nextEpisodeId]: data.images?.length ?? 0,
          }));
        } catch (error) {
          if (!controller.signal.aborted && request === detailRequest.current)
            setDetailWorkError(error instanceof Error ? error.message : String(error));
        }
      },
    );
  }

  async function countAllPages() {
    if (!details) return;
    const chapterIds = Object.keys(details.chapters ?? {});
    if (!chapterIds.length) return;
    setPreviewSummary(null);
    setDetailWorkError(null);
    const request = detailRequest.current;
    countController.current?.abort();
    const controller = new AbortController();
    countController.current = controller;
    const nextCounts = { ...episodePageCounts };
    let completed = chapterIds.filter((id) => nextCounts[id] !== undefined).length;
    let failed = 0;
    setCountProgress({ completed, total: chapterIds.length, failed });
    await options.runWith(
      (loading) => {
        if (request === detailRequest.current && countController.current === controller)
          setCountingPages(loading);
      },
      async () => {
        for (const chapterId of chapterIds) {
          if (controller.signal.aborted || request !== detailRequest.current) return;
          if (nextCounts[chapterId] !== undefined) continue;
          try {
            const pages = await veneraApi.episodePages(
              options.detailSourceKey,
              details.comicId ?? details.id,
              chapterId,
              controller.signal,
            );
            if (controller.signal.aborted || request !== detailRequest.current) return;
            nextCounts[chapterId] = pages.images?.length ?? 0;
            setEpisodePageCounts({ ...nextCounts });
          } catch {
            if (controller.signal.aborted || request !== detailRequest.current) return;
            // 失败章保留为未统计，后续可以重试，不能误报为零页。
            failed++;
          }
          setCountProgress({ completed: ++completed, total: chapterIds.length, failed });
        }
      },
    );
  }

  async function createDownload(mode: "first" | "selected" | "all") {
    if (!details) return;
    const requestId = detailRequest.current;
    setCountProgress(null);
    setPreviewSummary(null);
    setDetailWorkError(null);
    await options.runWith(
      (loading) => {
        if (requestId === detailRequest.current) setCreatingDownload(loading);
      },
      async () => {
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
          if (requestId === detailRequest.current)
            setDownloadCreateStatus(
              `创建中：${success + failed}/${requests.length}，成功 ${success}，失败 ${failed}`,
            );
        }
        if (requestId === detailRequest.current)
          setDownloadCreateStatus(`创建完成：成功 ${success}，失败 ${failed}`);
        if (failed === 0 && requestId === detailRequest.current) {
          setDetails(null);
          setPreviewImages([]);
          options.setActiveTab("downloads");
        }
        await options.loadDownloads();
      },
    );
  }

  function closeDetails() {
    detailRequest.current++;
    resetDetailWork();
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
  const detailsBusy = loadingDetails || previewingChapter || countingPages || creatingDownload;
  const searchBusy = searching || detailsBusy;

  return {
    aggregateResultLayout,
    aggregatePendingKeys,
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
    detailsBusy,
    detailOperation: previewingChapter
      ? `正在获取「${details?.chapters?.[previewEpisodeId ?? ""] ?? "当前章节"}」的图片列表…`
      : countingPages
        ? `正在统计章节页数：${countProgress?.completed ?? 0}/${countProgress?.total ?? 0} 章，失败 ${countProgress?.failed ?? 0} 章…`
        : creatingDownload
          ? (downloadCreateStatus ?? "正在创建下载任务…")
          : null,
    detailSummary:
      previewSummary ??
      (!countingPages && countProgress
        ? `${countProgress.stopped ? "统计已停止" : "统计已结束"}，已处理 ${countProgress.completed}/${countProgress.total} 章${countProgress.failed ? `，${countProgress.failed} 章失败，可重新统计` : ""}。`
        : null),
    detailWorkError,
    previewEpisodeId,
    countingPages,
    stopCounting,
    searching,
    cancelSearch,
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
