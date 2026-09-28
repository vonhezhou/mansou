import type { Comic } from "@venera/contracts";
import type { AggregatedSearchItem } from "../../types.js";
import { ComicCard } from "./ComicCard.js";

type SearchResultsProps = {
  busy: boolean;
  sourceKey: string;
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
      className={`search-results${props.hasSearched ? " has-results" : ""}`}
      aria-busy={props.busy}
    >
      {!props.hasSearched && (
        <div className="empty-state">
          <h2>从一本漫画开始</h2>
          <p className="muted">输入名称，搜索你已启用的漫画源。</p>
        </div>
      )}
      {props.hasSearched && props.searchMode === "single" && props.results.length === 0 && (
        <p className="muted">没有找到结果，可以更换关键词或源。</p>
      )}
      {props.hasSearched && props.searchMode === "aggregate" && aggregateCount === 0 && (
        <p className="muted">聚合搜索没有找到结果，或所有源均失败。</p>
      )}
      {props.searchMode === "single" && (
        <>
          <div className="cards">
            {props.results.map((comic) => (
              <ComicCard
                comic={comic}
                key={comic.id}
                sourceKey={props.sourceKey}
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
      {props.searchMode === "aggregate" && props.hasSearched && (
        <div className="result-toolbar">
          <h2>
            搜索结果 <span className="count-badge">{aggregateCount}</span>
          </h2>
          <div className="segmented-control">
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
        </div>
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
