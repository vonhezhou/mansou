import { useCallback, useEffect, useRef, useState } from "react";
import {
  novelApi,
  type NovelCatalog,
  type NovelOrigin,
  type NovelSearch,
  type NovelState,
  type NovelTask,
} from "../../api/novels.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { NovelSources } from "./NovelSources.js";
import { NovelDownloads } from "./NovelDownloads.js";
import { SearchControls } from "../search/SearchControls.js";
import { SourcePicker } from "../search/SourcePicker.js";
import { NovelSearchResults } from "./NovelSearchResults.js";
import { NovelDetailsDialog } from "./NovelDetailsDialog.js";

export function NovelsView() {
  const [tab, setTab] = useState<"search" | "sources" | "downloads">("search");
  const [state, setState] = useState<NovelState>({ sources: [], subscriptions: [] });
  const [tasks, setTasks] = useState<NovelTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>();
  const [sourceKey, setSourceKey] = useState("");
  const [searchMode, setSearchMode] = useState<"single" | "aggregate">("aggregate");
  const [result, setResult] = useState<NovelSearch>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [origin, setOrigin] = useState<NovelOrigin>();
  const [catalog, setCatalog] = useState<NovelCatalog>();
  const [catalogError, setCatalogError] = useState<string>();
  const searchController = useRef<AbortController | null>(null);
  const catalogController = useRef<AbortController | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const active = useRef(true);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }, []);
  const reloadTasks = useCallback(async () => {
    const values = await novelApi.tasks();
    if (active.current) setTasks(values);
  }, []);
  useEffect(() => {
    active.current = true;
    void run(async () => {
      const [values] = await Promise.all([novelApi.state(), reloadTasks()]);
      if (active.current) setState(values);
    });
    let polling = false;
    const timer = setInterval(() => {
      if (polling || document.hidden) return;
      polling = true;
      void reloadTasks()
        .catch((error) => {
          if (active.current)
            setError(`下载状态更新失败：${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          polling = false;
        });
    }, 2000);
    return () => {
      active.current = false;
      clearInterval(timer);
      searchController.current?.abort();
      catalogController.current?.abort();
    };
  }, [run, reloadTasks]);
  const available = state.sources.filter(
    (source) =>
      source.enabled &&
      source.searchSupported &&
      state.subscriptions.some((group) => group.id === source.groupId && group.enabled),
  );
  function changeState(value: NovelState) {
    setState(value);
    setSourceIds((ids) =>
      ids?.filter((id) =>
        value.sources.some(
          (source) =>
            source.id === id &&
            source.enabled &&
            source.searchSupported &&
            value.subscriptions.some((group) => group.id === source.groupId && group.enabled),
        ),
      ),
    );
  }
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
  async function search(
    page = 1,
    term = keyword,
    ids = searchMode === "single" ? [singleKey].filter(Boolean) : aggregateIds,
  ) {
    if (!term.trim() || !ids.length) return;
    if (ids.length > 100) {
      setSearchError("每次最多搜索 100 个书源，请减少选择");
      return;
    }
    searchController.current?.abort();
    catalogController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError(undefined);
    setResult(undefined);
    setOrigin(undefined);
    setCatalog(undefined);
    try {
      const value = await novelApi.search(term, page, ids, controller.signal);
      if (active.current && !controller.signal.aborted) setResult(value);
    } catch (error) {
      if (active.current && !controller.signal.aborted)
        setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      if (active.current && searchController.current === controller) setSearching(false);
    }
  }
  function closeCatalog() {
    catalogController.current?.abort();
    setOrigin(undefined);
    setCatalog(undefined);
  }
  useEffect(() => {
    // 关闭加载中的弹窗时，等待请求收尾、结果卡片恢复可用后再还原焦点。
    if (!origin && !busy && returnFocus.current) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [origin, busy]);
  async function select(value: NovelOrigin) {
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    setOrigin({ ...value });
    setCatalog(undefined);
    setCatalogError(undefined);
    const source = state.sources.find((source) => source.id === value.sourceId);
    if (!source?.downloadSupported) {
      setCatalogError(source?.downloadError ?? "该书源暂不支持目录与下载");
      return;
    }
    await run(async () => {
      try {
        const details = await novelApi.catalog(value, controller.signal);
        if (active.current && !controller.signal.aborted) setCatalog(details);
      } catch (error) {
        if (active.current && !controller.signal.aborted)
          setCatalogError(error instanceof Error ? error.message : String(error));
      }
    });
  }
  const download = (all: boolean, start: number, limit: number) =>
    void run(async () => {
      if (!origin) return;
      await novelApi.download(origin, all, start, limit);
      await reloadTasks();
      closeCatalog();
      setTab("downloads");
    });
  const selectedOrigins = origin
    ? (result?.results.find((book) =>
        book.origins.some(
          (value) => value.sourceId === origin.sourceId && value.bookUrl === origin.bookUrl,
        ),
      )?.origins ?? [origin])
    : [];
  return (
    <section className="novel-workspace">
      <nav className="novel-actions novel-main-tabs" aria-label="小说功能">
        {(
          [
            ["search", "搜索"],
            ["sources", "书源与订阅"],
            ["downloads", "小说下载"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "" : "secondary-button"}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => {
              closeCatalog();
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && !origin && (
        <p className="alert novel-status" role="alert">
          {error}
        </p>
      )}
      {busy && !origin && (
        <div className="novel-status">
          <LoadingStatus label="正在处理小说操作…" />
        </div>
      )}
      {tab === "search" ? (
        <>
          <section className="search-hero">
            <SearchControls
              kind="小说"
              cancelLabel="取消搜索"
              busy={busy || searching}
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
              busy={busy || searching}
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
              onManageSources={() => setTab("sources")}
            />
          </section>
          <NovelSearchResults
            result={result}
            searching={searching}
            busy={busy}
            error={searchError}
            onOpen={(book) => {
              returnFocus.current = document.activeElement as HTMLElement;
              const first =
                book.origins.find((value) =>
                  state.sources.some(
                    (source) => source.id === value.sourceId && source.downloadSupported,
                  ),
                ) ?? book.origins[0];
              if (first) void select(first);
            }}
            onPage={(page) => {
              if (result)
                void search(
                  page,
                  result.keyword,
                  result.sources.map((source) => source.sourceId),
                );
            }}
          />
        </>
      ) : (
        <div className="inner-page">
          <header className="page-title">
            <h1>{tab === "sources" ? "书源与订阅" : "小说下载"}</h1>
          </header>
          {tab === "sources" ? (
            <NovelSources state={state} busy={busy} run={run} onChange={changeState} />
          ) : (
            <NovelDownloads tasks={tasks} busy={busy} run={run} reload={reloadTasks} />
          )}
        </div>
      )}
      {origin && (
        <NovelDetailsDialog
          origin={origin}
          origins={selectedOrigins}
          sources={state.sources}
          catalog={catalog}
          error={catalogError ?? error}
          busy={busy}
          onSelect={(value) => void select(value)}
          onClose={closeCatalog}
          onDownload={download}
        />
      )}
    </section>
  );
}
