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

export function NovelsView() {
  const [tab, setTab] = useState<"search" | "sources" | "downloads">("search");
  const [state, setState] = useState<NovelState>({ sources: [], subscriptions: [] });
  const [tasks, setTasks] = useState<NovelTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [result, setResult] = useState<NovelSearch>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [origin, setOrigin] = useState<NovelOrigin>();
  const [catalog, setCatalog] = useState<NovelCatalog>();
  const [catalogError, setCatalogError] = useState<string>();
  const catalogPanel = useRef<HTMLElement>(null);
  const [start, setStart] = useState(1);
  const [limit, setLimit] = useState(3);
  const searchController = useRef<AbortController | null>(null);
  const catalogController = useRef<AbortController | null>(null);
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
      ids.filter((id) =>
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
  async function search(page = 1, term = keyword, ids = sourceIds) {
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
  useEffect(() => {
    if (origin) {
      catalogPanel.current?.focus({ preventScroll: true });
      catalogPanel.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [origin]);
  function closeCatalog() {
    catalogController.current?.abort();
    setOrigin(undefined);
    setCatalog(undefined);
  }
  async function select(value: NovelOrigin) {
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    setOrigin(value);
    setCatalog(undefined);
    setCatalogError(undefined);
    setStart(1);
    setLimit(3);
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
  const download = (all: boolean) =>
    void run(async () => {
      if (!origin) return;
      await novelApi.download(origin, all, start, limit);
      await reloadTasks();
      setTab("downloads");
    });
  return (
    <section className="inner-page novel-workspace">
      <header className="page-title">
        <div>
          <span className="eyebrow">NOVELS · EXPERIMENTAL</span>
          <h1>小说</h1>
          <p>
            自定义文本书源、聚合搜索与 TXT
            下载。支持部分阅读书源规则，暂不支持脚本、登录与浏览器验证。
          </p>
        </div>
      </header>
      <nav className="novel-actions novel-tabs" aria-label="小说功能">
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
              if (key !== "search") closeCatalog();
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {busy && <LoadingStatus label="正在处理小说操作…" />}
      {tab === "sources" && (
        <NovelSources state={state} busy={busy} run={run} onChange={changeState} />
      )}
      {tab === "downloads" && (
        <NovelDownloads tasks={tasks} busy={busy} run={run} reload={reloadTasks} />
      )}
      {tab === "search" && (
        <div className="novel-stack">
          <section className="novel-panel">
            <form
              className="novel-inline"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <label>
                书名或作者
                <input
                  value={keyword}
                  maxLength={100}
                  onChange={(event) => setKeyword(event.target.value)}
                  required
                />
              </label>
              <button disabled={searching || busy || !keyword.trim() || !available.length}>
                搜索小说
              </button>
              {searching && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    searchController.current?.abort();
                    setSearching(false);
                    setSearchError("搜索已取消");
                  }}
                >
                  取消搜索
                </button>
              )}
            </form>
            <details>
              <summary>
                选择书源（
                {sourceIds.length
                  ? `已选 ${sourceIds.length} 个`
                  : `全部 ${available.length} 个可搜索源`}
                ）
              </summary>
              <p className="muted">
                单源勾选一个，聚合勾选多个；不勾选时搜索全部可用源，每次最多 100 个。
              </p>
              <button
                className="secondary-button"
                disabled={searching}
                onClick={() => setSourceIds([])}
              >
                恢复搜索全部源
              </button>
              <div className="novel-source-picker">
                {available.map((source) => (
                  <label key={source.id}>
                    <input
                      type="checkbox"
                      disabled={searching}
                      checked={sourceIds.includes(source.id)}
                      onChange={(event) =>
                        setSourceIds((ids) =>
                          event.target.checked
                            ? [...ids, source.id]
                            : ids.filter((id) => id !== source.id),
                        )
                      }
                    />
                    {source.name}
                  </label>
                ))}
              </div>
            </details>
            {!available.length && (
              <p className="muted">没有已启用且支持搜索的书源，请先在“书源与订阅”中导入。</p>
            )}
          </section>
          {searching && <LoadingStatus label="正在搜索小说…" />}
          {searchError && <p role="status">{searchError}</p>}
          {result && (
            <>
              <p role="status">
                “{result.keyword}”第 {result.page} 页 · {result.results.length} 本 ·{" "}
                {result.completedSources}/{result.totalSources} 个源已返回
              </p>
              {result.sources
                .filter((source) => source.status === "error")
                .map((source) => (
                  <p className="alert" key={source.sourceId}>
                    {source.sourceName}：{source.error?.message}
                  </p>
                ))}
              {!result.results.length && (
                <p className="muted">本页没有小说结果；请同时检查上方书源错误。</p>
              )}
              {result.results.map((book, index) => {
                const primary = book.origins.find((value) =>
                  state.sources.some(
                    (source) => source.id === value.sourceId && source.downloadSupported,
                  ),
                );
                return (
                  <article key={index} className="novel-panel">
                    <h2>
                      {primary ? (
                        <button
                          className="novel-book-title"
                          disabled={busy}
                          onClick={() => void select(primary)}
                        >
                          {book.name}
                        </button>
                      ) : (
                        book.name
                      )}
                    </h2>
                    <p className="muted">
                      {book.author || "作者未知"} · {book.origins.length} 个来源
                    </p>
                    <div className="novel-actions">
                      {book.origins.map((value) => {
                        const source = state.sources.find((source) => source.id === value.sourceId);
                        return (
                          <button
                            className="secondary-button"
                            key={`${value.sourceId}:${value.bookUrl}`}
                            disabled={busy || !source?.downloadSupported}
                            title={source?.downloadError}
                            onClick={() => void select(value)}
                          >
                            {value.sourceName}
                            {source?.downloadSupported ? " · 目录与下载" : " · 暂不支持下载"}
                          </button>
                        );
                      })}
                    </div>
                    {origin &&
                      book.origins.some(
                        (value) =>
                          value.sourceId === origin.sourceId && value.bookUrl === origin.bookUrl,
                      ) && (
                        <section
                          className="novel-selected-catalog"
                          aria-label="小说目录"
                          ref={catalogPanel}
                          tabIndex={-1}
                          aria-busy={busy}
                        >
                          <div className="novel-row">
                            <h2>
                              {origin.name} · {origin.sourceName}
                            </h2>
                            <button className="secondary-button" onClick={closeCatalog}>
                              关闭目录
                            </button>
                          </div>
                          {busy && !catalog && <LoadingStatus label="正在加载所选书源目录…" />}
                          {catalogError && (
                            <p className="alert" role="alert">
                              {catalogError}
                            </p>
                          )}
                          {!catalog && !busy && (
                            <button onClick={() => void select(origin)}>重新加载目录</button>
                          )}
                          {catalog && (
                            <>
                              <p>
                                共 {catalog.chapters.length} 项 · 已解析 {catalog.tocPages} 页 ·{" "}
                                {catalog.tocComplete
                                  ? "目录遍历完成"
                                  : "目录尚未遍历完，暂不能下载"}
                              </p>
                              <p className="muted">
                                章节保留站点原始顺序，可能含公告。请先检查顺序和范围；这里不判断作品是否完结。
                              </p>
                              <div className="novel-inline">
                                <label>
                                  起始目录项
                                  <input
                                    type="number"
                                    min={1}
                                    max={catalog.chapters.length}
                                    value={start}
                                    onChange={(event) => setStart(Number(event.target.value))}
                                  />
                                </label>
                                <label>
                                  下载项数
                                  <input
                                    type="number"
                                    min={1}
                                    max={50000}
                                    value={limit}
                                    onChange={(event) => setLimit(Number(event.target.value))}
                                  />
                                </label>
                                <button
                                  disabled={
                                    busy ||
                                    !catalog.tocComplete ||
                                    !Number.isInteger(start) ||
                                    start < 1 ||
                                    start > catalog.chapters.length ||
                                    !Number.isInteger(limit) ||
                                    limit < 1 ||
                                    limit > 50000
                                  }
                                  onClick={() => download(false)}
                                >
                                  下载所选范围
                                </button>
                                <button
                                  disabled={busy || !catalog.tocComplete}
                                  onClick={() => {
                                    setStart(1);
                                    void run(async () => {
                                      await novelApi.download(origin, true, 1, 3);
                                      await reloadTasks();
                                      setTab("downloads");
                                    });
                                  }}
                                >
                                  下载目录全部章节
                                </button>
                              </div>
                              <ol className="novel-catalog">
                                {catalog.chapters.slice(0, 200).map((chapter, index) => (
                                  <li key={chapter.url}>
                                    {index + 1}. {chapter.title}
                                  </li>
                                ))}
                              </ol>
                              {catalog.chapters.length > 200 && (
                                <p className="muted">
                                  仅展示前 200 项，下载包含所选范围内全部章节。
                                </p>
                              )}
                            </>
                          )}
                        </section>
                      )}
                  </article>
                );
              })}
              <div className="novel-actions">
                <button
                  className="secondary-button"
                  disabled={searching || result.page <= 1}
                  onClick={() =>
                    void search(
                      result.page - 1,
                      result.keyword,
                      result.sources.map((source) => source.sourceId),
                    )
                  }
                >
                  上一页
                </button>
                <button
                  className="secondary-button"
                  disabled={searching || result.page >= 1000}
                  onClick={() =>
                    void search(
                      result.page + 1,
                      result.keyword,
                      result.sources.map((source) => source.sourceId),
                    )
                  }
                >
                  下一页
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
