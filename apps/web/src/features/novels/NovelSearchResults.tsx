import { useState } from "react";
import type { NovelOrigin, NovelSearch } from "../../api/novels.js";
import { AsyncImage } from "../../app/AsyncImage.js";
import { Icon } from "../../app/Icon.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";

type Book = NovelSearch["results"][number];
type Props = {
  result?: NovelSearch;
  searching: boolean;
  busy: boolean;
  error?: string;
  onOpen: (book: Book) => void;
  onPage: (page: number) => void;
};

function BookCard({ book, busy, onOpen }: { book: Book; busy: boolean; onOpen: Props["onOpen"] }) {
  const cover = book.origins.find((origin) => origin.coverUrl)?.coverUrl;
  return (
    <button
      className="comic-card"
      disabled={busy}
      onClick={() => onOpen(book)}
      aria-label={`查看 ${book.name} 的详情`}
    >
      {cover ? (
        <AsyncImage src={cover} alt="" loading="lazy" />
      ) : (
        <span className="async-image" aria-hidden="true">
          <span className="image-placeholder">暂无封面</span>
        </span>
      )}
      <span className="comic-card-info">
        <span className="source-label">
          {book.origins.length > 1 ? `${book.origins.length} 个来源` : book.origins[0]?.sourceName}
        </span>
        <strong>{book.name}</strong>
        <span className="comic-subtitle">{book.author || "作者未知"}</span>
        <span className="comic-card-foot">
          查看目录与下载
          <Icon name="chevron" size={15} />
        </span>
      </span>
    </button>
  );
}

export function NovelSearchResults({ result, searching, busy, error, onOpen, onPage }: Props) {
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [grouping, setGrouping] = useState<"grouped" | "flat">("grouped");
  const failed = result?.sources.filter((source) => source.status === "error") ?? [];
  const aggregate = (result?.totalSources ?? 0) > 1;
  return (
    <section
      className={`search-results ${layout === "list" ? "list-layout" : ""}`}
      aria-busy={searching}
    >
      <header className="result-toolbar">
        <div className="result-heading">
          <h2>{result ? "搜索结果" : "开始探索"}</h2>
          {result && (
            <>
              <span className="muted">
                「{result.keyword}」 · 第 {result.page} 页
              </span>
              <span className="muted" role="status">
                {result.results.length} 本 · {result.completedSources}/{result.totalSources}{" "}
                个源已返回
              </span>
            </>
          )}
        </div>
        <div className="result-view-controls">
          {aggregate && (
            <div className="segmented-control" role="group" aria-label="结果分组">
              {(["grouped", "flat"] as const).map((value) => (
                <button
                  key={value}
                  className={grouping === value ? "active" : ""}
                  aria-pressed={grouping === value}
                  onClick={() => setGrouping(value)}
                >
                  {value === "grouped" ? "按源分组" : "全部平铺"}
                </button>
              ))}
            </div>
          )}
          <div className="segmented-control view-toggle" role="group" aria-label="结果视图">
            {(["grid", "list"] as const).map((value) => (
              <button
                key={value}
                className={layout === value ? "active" : ""}
                aria-label={value === "grid" ? "网格视图" : "列表视图"}
                aria-pressed={layout === value}
                onClick={() => setLayout(value)}
              >
                <Icon name={value} size={18} />
              </button>
            ))}
          </div>
        </div>
      </header>
      {searching && <LoadingStatus label="正在搜索小说…" />}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {failed.length > 0 && (
        <details className="search-source-errors">
          <summary>
            <span className="search-source-errors-title" role="status">
              {failed.length} 个源搜索失败
            </span>
            <span className="search-source-errors-hint">
              {result?.results.length ? "已有结果仍可正常查看" : "可稍后重试，或更换书源"}
            </span>
            <span className="search-source-errors-toggle">
              查看原因
              <Icon name="chevron" size={14} />
            </span>
          </summary>
          <ul>
            {failed.map((source) => (
              <li key={source.sourceId}>
                <strong>{source.sourceName}</strong>
                <p>{source.error?.message}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!result && !searching && !error && (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="search" size={28} />
          </span>
          <h2>从一本小说开始</h2>
          <p className="muted">输入书名或作者，搜索你已启用的书源。</p>
        </div>
      )}
      {result && !result.results.length && (
        <p className="muted">本页没有小说结果，可以更换关键词或书源。</p>
      )}
      {result && aggregate && grouping === "grouped" ? (
        <div className="aggregate-results">
          {result.sources.map((source) => (
            <section className="aggregate-source" key={source.sourceId}>
              <header>
                <div className="section-identity">
                  <span className="source-avatar" aria-hidden="true">
                    {source.sourceName.slice(0, 1)}
                  </span>
                  <h3>{source.sourceName}</h3>
                </div>
                <span className="muted">
                  {source.status === "error" ? "搜索失败" : `${source.books.length} 项`}
                </span>
              </header>
              <div className="cards">
                {source.books.map((book) => {
                  const origin: NovelOrigin = {
                    ...book,
                    sourceId: source.sourceId,
                    sourceName: source.sourceName,
                  };
                  return (
                    <BookCard
                      key={book.bookUrl}
                      book={{ name: book.name, author: book.author, origins: [origin] }}
                      busy={busy}
                      onOpen={onOpen}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="cards">
          {result?.results.map((book, index) => (
            <BookCard key={index} book={book} busy={busy} onOpen={onOpen} />
          ))}
        </div>
      )}
      {result && (
        <div className="load-more">
          <span className="muted">
            第 {result.page} 页 · {result.results.length} 本
          </span>
          <button
            className="secondary-button"
            disabled={searching || result.page <= 1}
            onClick={() => onPage(result.page - 1)}
          >
            上一页
          </button>
          <button
            disabled={searching || result.page >= 1000}
            onClick={() => onPage(result.page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
