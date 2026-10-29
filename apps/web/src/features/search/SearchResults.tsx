import { useState } from "react";
import { Icon } from "../../app/Icon.js";
import type { Comic } from "@venera/contracts";
import type { AggregatedSearchItem } from "../../types.js";
import { ComicCard } from "./ComicCard.js";

type SearchResultsProps = {
  busy: boolean;
  sourceKey: string;
  sourceName?: string;
  keyword?: string;
  searchMode: "single" | "aggregate";
  aggregateResultLayout: "grouped" | "flat";
  results: Comic[];
  aggregatedResults: AggregatedSearchItem[];
  hasSearched: boolean;
  searchPage: number;
  searchMaxPage?: number;
  canLoadMore: boolean;
  onAggregateResultLayoutChange: (value: "grouped" | "flat") => void;
  onLoadMore: () => void;
  onOpenComic: (comic: Comic, sourceKey?: string) => void;
};

export function SearchResults(props: SearchResultsProps) {
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const aggregateCount = props.aggregatedResults.reduce(
    (count, item) => count + (item.result?.comics.length ?? 0),
    0,
  );
  const flatAggregatedResults = props.aggregatedResults.flatMap((item) =>
    (item.result?.comics ?? []).map((comic) => ({
      comic,
      sourceKey: item.sourceKey,
      sourceName: item.sourceName,
    })),
  );

  return (
    <section
      className={`search-results ${layout === "list" ? "list-layout" : ""}`}
      aria-busy={props.busy}
    >
      <header className="result-toolbar">
        <div className="result-heading">
          <h2>{props.hasSearched ? "搜索结果" : "开始探索"}</h2>
          {props.hasSearched && props.keyword && (
            <span className="muted">
              「{props.keyword}」 ·{" "}
              {props.searchMode === "aggregate"
                ? "聚合搜索"
                : (props.sourceName ?? props.sourceKey)}
            </span>
          )}
          {props.hasSearched && (
            <span className="muted" role="status">
              已加载 {props.searchMode === "aggregate" ? aggregateCount : props.results.length}{" "}
              个结果
            </span>
          )}
        </div>
        <div className="result-view-controls">
          {props.searchMode === "aggregate" && props.hasSearched && (
            <div className="segmented-control" role="group" aria-label="结果分组">
              <button
                aria-pressed={props.aggregateResultLayout === "grouped"}
                className={props.aggregateResultLayout === "grouped" ? "active" : ""}
                onClick={() => props.onAggregateResultLayoutChange("grouped")}
              >
                按源分组
              </button>
              <button
                aria-pressed={props.aggregateResultLayout === "flat"}
                className={props.aggregateResultLayout === "flat" ? "active" : ""}
                onClick={() => props.onAggregateResultLayoutChange("flat")}
              >
                全部平铺
              </button>
            </div>
          )}
          <div className="segmented-control view-toggle" role="group" aria-label="结果视图">
            <button
              aria-label="网格视图"
              title="网格视图"
              aria-pressed={layout === "grid"}
              className={layout === "grid" ? "active" : ""}
              onClick={() => setLayout("grid")}
            >
              <Icon name="grid" size={17} />
            </button>
            <button
              aria-label="列表视图"
              title="列表视图"
              aria-pressed={layout === "list"}
              className={layout === "list" ? "active" : ""}
              onClick={() => setLayout("list")}
            >
              <Icon name="list" size={18} />
            </button>
          </div>
        </div>
      </header>
      {props.busy &&
        (props.searchMode === "aggregate" ? aggregateCount === 0 : props.results.length === 0) && (
          <p className="muted" role="status">
            正在搜索，请稍候…
          </p>
        )}
      {!props.hasSearched && !props.busy && (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="search" size={28} />
          </span>
          <h2>从一本漫画开始</h2>
          <p className="muted">输入名称，搜索你已启用的漫画源。</p>
        </div>
      )}
      {props.hasSearched &&
        !props.busy &&
        props.searchMode === "single" &&
        props.results.length === 0 && <p className="muted">没有找到结果，可以更换关键词或源。</p>}
      {props.hasSearched &&
        !props.busy &&
        props.searchMode === "aggregate" &&
        aggregateCount === 0 && <p className="muted">聚合搜索没有找到结果，或所有源均失败。</p>}
      {props.searchMode === "single" && (
        <>
          <div className="cards">
            {props.results.map((comic) => (
              <ComicCard
                comic={comic}
                key={comic.id}
                sourceKey={props.sourceKey}
                sourceName={props.sourceName}
                onOpenComic={props.onOpenComic}
                busy={props.busy}
              />
            ))}
          </div>
          {props.results.length > 0 && (
            <div className="load-more">
              <span className="muted">
                已加载 {props.results.length} 项
                {props.searchMaxPage
                  ? ` / 第 ${props.searchPage} 页，共 ${props.searchMaxPage} 页`
                  : ""}
              </span>
              <button onClick={props.onLoadMore} disabled={props.busy || !props.canLoadMore}>
                {props.canLoadMore ? "加载更多" : "没有更多"}
              </button>
            </div>
          )}
        </>
      )}
      {props.searchMode === "aggregate" &&
        props.aggregateResultLayout === "flat" &&
        props.aggregatedResults.some((item) => item.error) && (
          <p className="alert" role="status">
            {props.aggregatedResults
              .filter((item) => item.error)
              .map((item) => `${item.sourceName}：${item.error}`)
              .join("；")}
          </p>
        )}
      {props.searchMode === "aggregate" && props.aggregateResultLayout === "flat" && (
        <div className="cards">
          {flatAggregatedResults.map(({ comic, sourceKey, sourceName }) => (
            <ComicCard
              comic={comic}
              key={`${sourceKey}:${comic.id}`}
              sourceKey={sourceKey}
              sourceName={sourceName}
              onOpenComic={props.onOpenComic}
              busy={props.busy}
            />
          ))}
        </div>
      )}
      {props.searchMode === "aggregate" && props.aggregateResultLayout === "grouped" && (
        <div className="aggregate-results">
          {props.aggregatedResults.map((item) => (
            <section className="aggregate-source" key={item.sourceKey}>
              <header>
                <div className="section-identity">
                  <span className="source-avatar" aria-hidden="true">
                    {item.sourceName.slice(0, 1)}
                  </span>
                  <h3>{item.sourceName}</h3>
                </div>
                <span className="muted">
                  {item.sourceKey}
                  {item.error ? ` / ${item.error}` : ` / ${item.result?.comics.length ?? 0} 项`}
                </span>
              </header>
              {item.result?.comics.length ? (
                <div className="cards">
                  {item.result.comics.map((comic) => (
                    <ComicCard
                      comic={comic}
                      key={`${item.sourceKey}:${comic.id}`}
                      sourceKey={item.sourceKey}
                      sourceName={item.sourceName}
                      onOpenComic={props.onOpenComic}
                      busy={props.busy}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
