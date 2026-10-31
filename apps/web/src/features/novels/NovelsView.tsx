import { useCallback, useEffect, useRef, useState } from "react";
import { novelApi, type NovelOrigin, type NovelSearch } from "../../api/novels.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { useNovelCatalog } from "../../hooks/useNovelCatalog.js";
import type { NovelSourcesState } from "../../hooks/useNovelSources.js";
import type { TabKey } from "../../app/navigation.js";
import { SearchControls } from "../search/SearchControls.js";
import { SourcePicker } from "../search/SourcePicker.js";
import { NovelSearchResults } from "./NovelSearchResults.js";
import { NovelDetailsDialog } from "./NovelDetailsDialog.js";

export function NovelsView({
  sourceState,
  onNavigate,
  onDownloadCreated,
}: {
  sourceState: NovelSourcesState;
  onNavigate: (tab: TabKey) => void;
  onDownloadCreated: () => Promise<void>;
}) {
  const { state, busy: sourceBusy, error: sourceError } = sourceState;
  const { origin, catalog, loading, error: catalogError, load, close } = useNovelCatalog();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string>();
  const creating = useRef(false);
  const selection = useRef(0);
  const [keyword, setKeyword] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>();
  const [sourceKey, setSourceKey] = useState("");
  const [searchMode, setSearchMode] = useState<"single" | "aggregate">("aggregate");
  const [result, setResult] = useState<NovelSearch>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const searchController = useRef<AbortController | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      searchController.current?.abort();
    };
  }, []);
  const available = state.sources.filter(
    (source) =>
      source.enabled &&
      source.searchSupported &&
      state.subscriptions.some((group) => group.id === source.groupId && group.enabled),
  );
  const aggregateIds = (sourceIds ?? available.map((source) => source.id)).filter((id) =>
    available.some((source) => source.id === id),
  );
  const singleKey = available.some((source) => source.id === sourceKey)
    ? sourceKey
    : (available[0]?.id ?? "");
  const searchSources = available.map((source) => ({
    key: source.id,
    name: source.name,
    hasSearch: true,
  }));
  const closeCatalog = useCallback(() => {
    selection.current++;
    close();
    setDownloadError(undefined);
  }, [close]);
  const runSearch = useCallback(
    async (page: number, term: string, ids: string[]) => {
      if (!term.trim() || !ids.length) return;
      if (ids.length > 100) {
        setSearchError("每次最多搜索 100 个书源，请减少选择");
        return;
      }
      searchController.current?.abort();
      closeCatalog();
      const controller = new AbortController();
      searchController.current = controller;
      setSearching(true);
      setSearchError(undefined);
      setResult(undefined);
      try {
        const value = await novelApi.search(term, page, ids, controller.signal);
        if (active.current && !controller.signal.aborted) setResult(value);
      } catch (error) {
        if (active.current && !controller.signal.aborted)
          setSearchError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active.current && searchController.current === controller) setSearching(false);
      }
    },
    [closeCatalog],
  );
  const search = () =>
    runSearch(1, keyword, searchMode === "single" ? [singleKey].filter(Boolean) : aggregateIds);
  useEffect(() => {
    if (!origin && !downloading && returnFocus.current) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [origin, downloading]);
  const select = useCallback(
    (value: NovelOrigin, refresh = false) => {
      if (creating.current) return;
      selection.current++;
      setDownloadError(undefined);
      const source = state.sources.find((source) => source.id === value.sourceId);
      const enabled =
        source && state.subscriptions.some((group) => group.id === source.groupId && group.enabled);
      void load(value, enabled ? source : undefined, refresh);
    },
    [load, state.sources, state.subscriptions],
  );
  const openBook = useCallback(
    (book: NovelSearch["results"][number]) => {
      returnFocus.current = document.activeElement as HTMLElement;
      const first =
        book.origins.find((value) =>
          state.sources.some((source) => source.id === value.sourceId && source.downloadSupported),
        ) ?? book.origins[0];
      if (first) select(first);
    },
    [select, state.sources],
  );
  const changePage = useCallback(
    (page: number) => {
      if (result)
        void runSearch(
          page,
          result.keyword,
          result.sources.map((source) => source.sourceId),
        );
    },
    [result, runSearch],
  );
  const download = async (all: boolean, start: number, limit: number) => {
    if (creating.current || !origin || !catalog?.tocComplete) return;
    const selected = selection.current;
    creating.current = true;
    setDownloading(true);
    setDownloadError(undefined);
    let created = false;
    try {
      await novelApi.download(origin, all, start, limit);
      created = true;
      await onDownloadCreated();
      // 请求提交后允许关闭弹窗；后台任务仍保留，但迟到结果不能把用户带离当前页面。
      if (active.current && selection.current === selected) {
        closeCatalog();
        onNavigate("downloads");
      }
    } catch (error) {
      if (active.current)
        setDownloadError(
          `《${origin.name}》${created ? "任务已创建，但刷新任务列表失败，可前往下载任务查看：" : "创建下载失败："}${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      creating.current = false;
      if (active.current) setDownloading(false);
    }
  };
  const selectedOrigins = origin
    ? (result?.results.find((book) =>
        book.origins.some(
          (value) => value.sourceId === origin.sourceId && value.bookUrl === origin.bookUrl,
        ),
      )?.origins ?? [origin])
    : [];
  return (
    <section className="novel-workspace">
      {downloadError && !origin && (
        <div className="alert novel-status" role="alert">
          <p>{downloadError}</p>
          <button className="secondary-button" onClick={() => onNavigate("downloads")}>
            查看下载任务
          </button>
        </div>
      )}
      {sourceError && !origin && (
        <p className="alert novel-status" role="alert">
          {sourceError}
        </p>
      )}
      {sourceBusy && !origin && (
        <div className="novel-status">
          <LoadingStatus label="正在处理小说操作…" />
        </div>
      )}
      <section className="search-hero">
        <SearchControls
          kind="小说"
          cancelLabel="取消搜索"
          busy={sourceBusy || downloading || searching}
          searching={searching}
          sourceKey={singleKey}
          sources={searchSources}
          keyword={keyword}
          searchMode={searchMode}
          aggregateSourceKeys={aggregateIds}
          onKeywordChange={setKeyword}
          onSearchModeChange={setSearchMode}
          onSearch={() => void search()}
          onCancelSearch={() => {
            searchController.current?.abort();
            setSearching(false);
            setSearchError("搜索已取消");
          }}
        />
        <SourcePicker
          kind="小说"
          sources={searchSources}
          sourceKey={singleKey}
          searchMode={searchMode}
          aggregateSourceKeys={aggregateIds}
          busy={sourceBusy || downloading || searching}
          onSourceChange={setSourceKey}
          onToggleAggregateSource={(id) =>
            setSourceIds(
              aggregateIds.includes(id)
                ? aggregateIds.filter((key) => key !== id)
                : [...aggregateIds, id],
            )
          }
          onSelectAggregateSources={(action) =>
            setSourceIds(
              action === "all"
                ? available.map((source) => source.id)
                : available
                    .filter((source) => !aggregateIds.includes(source.id))
                    .map((source) => source.id),
            )
          }
          onManageSources={() => onNavigate("novel-sources")}
        />
      </section>
      <NovelSearchResults
        result={result}
        searching={searching}
        busy={downloading}
        error={searchError}
        onOpen={openBook}
        onPage={changePage}
      />
      {origin && (
        <NovelDetailsDialog
          origin={origin}
          book={result?.sources
            .find((source) => source.sourceId === origin.sourceId)
            ?.books.find((book) => book.bookUrl === origin.bookUrl)}
          origins={selectedOrigins}
          sources={state.sources}
          catalog={catalog}
          error={catalogError}
          loading={loading}
          downloading={downloading}
          downloadError={downloadError}
          onRefresh={() => select(origin, true)}
          onSelect={select}
          onClose={closeCatalog}
          onDownload={download}
        />
      )}
    </section>
  );
}
