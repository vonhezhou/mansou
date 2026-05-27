import type { Comic } from "@venera/contracts";
import { imageUrl } from "../api/venera.js";
import type { AggregatedSearchItem, Details, Source } from "../types.js";

type SearchViewProps = {
  busy: boolean;
  sourceKey: string;
  detailSourceKey: string;
  sources: Source[];
  keyword: string;
  searchMode: "single" | "aggregate";
  aggregateSourceKeys: string[];
  aggregateResultLayout: "grouped" | "flat";
  results: Comic[];
  aggregatedResults: AggregatedSearchItem[];
  details: Details | null;
  episodeId: string | null;
  selectedEpisodeIds: string[];
  images: string[];
  hasSearched: boolean;
  searchPage: number;
  searchMaxPage?: number;
  canLoadMore: boolean;
  downloadCreateStatus: string | null;
  onSourceChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onSearchModeChange: (value: "single" | "aggregate") => void;
  onToggleAggregateSource: (value: string) => void;
  onAggregateResultLayoutChange: (value: "grouped" | "flat") => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onOpenComic: (comic: Comic, sourceKey?: string) => void;
  onDownloadComic: (comic: Comic, sourceKey?: string) => void;
  onReadEpisode: (episodeId?: string | null) => void;
  onToggleSelectedEpisode: (episodeId: string) => void;
  onSelectEpisodes: (action: "all" | "clear" | "invert") => void;
  onCreateDownload: (mode: "first" | "selected" | "all") => void;
};

export function SearchView(props: SearchViewProps) {
  const aggregateCount = props.aggregatedResults.reduce((count, item) => count + (item.result?.comics.length ?? 0), 0);
  const canSearch = props.searchMode === "aggregate" ? props.aggregateSourceKeys.length > 0 : Boolean(props.sourceKey);
  const flatAggregatedResults = props.aggregatedResults.flatMap((item) => (item.result?.comics ?? []).map((comic) => ({ comic, sourceKey: item.sourceKey, sourceName: item.sourceName })));

  return <>
    <section className="panel controls">
      <label>搜索模式<select value={props.searchMode} onChange={(event) => props.onSearchModeChange(event.target.value as "single" | "aggregate")}><option value="single">单源搜索</option><option value="aggregate">聚合搜索</option></select></label>
      <label>源<select value={props.sourceKey} onChange={(event) => props.onSourceChange(event.target.value)}>{props.sources.map((source) => <option key={source.key} value={source.key}>{source.name} ({source.key})</option>)}</select></label>
      <label>关键词<input value={props.keyword} onChange={(event) => props.onKeywordChange(event.target.value)} placeholder="输入关键词" /></label>
      <button onClick={props.onSearch} disabled={props.busy || !canSearch}>搜索</button>
    </section>

    {props.searchMode === "aggregate" && <section className="panel source-picker">
      <h2>参与聚合搜索的源</h2>
      <div className="check-list">
        {props.sources.filter((source) => source.hasSearch).map((source) => <label key={source.key}><input checked={props.aggregateSourceKeys.includes(source.key)} onChange={() => props.onToggleAggregateSource(source.key)} type="checkbox" /> {source.name} <span className="muted">({source.key})</span></label>)}
      </div>
      {props.aggregateSourceKeys.length === 0 && <p className="muted">请选择至少一个源，避免默认搜索全部源。</p>}
    </section>}

    <section className="grid">
      <div className="panel">
        <h2>搜索结果</h2>
        {!props.hasSearched && <p className="muted">输入关键词后开始搜索。</p>}
        {props.hasSearched && props.searchMode === "single" && props.results.length === 0 && <p className="muted">没有找到结果，可以更换关键词或源。</p>}
        {props.hasSearched && props.searchMode === "aggregate" && aggregateCount === 0 && <p className="muted">聚合搜索没有找到结果，或所有源均失败。</p>}
        {props.searchMode === "single" && <><div className="cards">
          {props.results.map((comic) => <ComicResultCard comic={comic} key={comic.id} sourceKey={props.sourceKey} onOpenComic={props.onOpenComic} onDownloadComic={props.onDownloadComic} />)}
        </div>
        {props.results.length > 0 && <div className="load-more"><span className="muted">已加载 {props.results.length} 项{props.searchMaxPage ? ` / 第 ${props.searchPage} 页，共 ${props.searchMaxPage} 页` : ""}</span><button onClick={props.onLoadMore} disabled={props.busy || !props.canLoadMore}>{props.canLoadMore ? "加载更多" : "没有更多"}</button></div>}</>}
        {props.searchMode === "aggregate" && props.hasSearched && <div className="result-toolbar"><span className="muted">聚合结果 {aggregateCount} 项</span><button className={props.aggregateResultLayout === "grouped" ? "active" : ""} onClick={() => props.onAggregateResultLayoutChange("grouped")}>按源分组</button><button className={props.aggregateResultLayout === "flat" ? "active" : ""} onClick={() => props.onAggregateResultLayoutChange("flat")}>全部平铺</button></div>}
        {props.searchMode === "aggregate" && props.aggregateResultLayout === "flat" && <div className="cards">{flatAggregatedResults.map(({ comic, sourceKey, sourceName }) => <ComicResultCard comic={comic} key={`${sourceKey}:${comic.id}`} sourceKey={sourceKey} sourceName={sourceName} onOpenComic={props.onOpenComic} onDownloadComic={props.onDownloadComic} />)}</div>}
        {props.searchMode === "aggregate" && props.aggregateResultLayout === "grouped" && <div className="aggregate-results">{props.aggregatedResults.map((item) => <section className="aggregate-source" key={item.sourceKey}><header><h3>{item.sourceName}</h3><span className="muted">{item.sourceKey}{item.error ? ` / ${item.error}` : ` / ${item.result?.comics.length ?? 0} 项`}</span></header>{item.result?.comics.length ? <div className="cards">{item.result.comics.map((comic) => <ComicResultCard comic={comic} key={`${item.sourceKey}:${comic.id}`} sourceKey={item.sourceKey} sourceName={item.sourceName} onOpenComic={props.onOpenComic} onDownloadComic={props.onDownloadComic} />)}</div> : null}</section>)}</div>}
      </div>

      <aside className="panel details">
        <h2>详情</h2>
        {props.details ? <>
          {props.details.cover && <img className="detail-cover" src={imageUrl(props.detailSourceKey, props.details.cover, props.details.comicId ?? props.details.id, undefined, true)} alt="" />}
          <h3>{props.details.title}</h3>
          <p>{props.details.description}</p>
          <p className="muted">漫画 ID：{props.details.comicId ?? props.details.id}</p>
          <div className="selection-actions"><button onClick={() => props.onSelectEpisodes("all")}>全选</button><button onClick={() => props.onSelectEpisodes("clear")}>清空</button><button onClick={() => props.onSelectEpisodes("invert")}>反选</button><span className="muted">已选 {props.selectedEpisodeIds.length} 章</span></div>
          <div className="chips">{Object.entries(props.details.chapters ?? {}).map(([id, title]) => <span className="chapter-chip" key={id}><label><input checked={props.selectedEpisodeIds.includes(id)} onChange={() => props.onToggleSelectedEpisode(id)} type="checkbox" /> {title}</label><button className={id === props.episodeId ? "active" : ""} onClick={() => props.onReadEpisode(id)}>阅读</button></span>)}</div>
          <div className="actions"><button onClick={() => props.onReadEpisode()}>开始阅读</button><button onClick={() => props.onCreateDownload("first")}>只下载首章</button><button onClick={() => props.onCreateDownload("selected")} disabled={props.selectedEpisodeIds.length === 0}>下载所选章节</button><button onClick={() => props.onCreateDownload("all")}>下载全本</button></div>
          {props.downloadCreateStatus && <p className="muted">{props.downloadCreateStatus}</p>}
        </> : <p className="muted">选择一本漫画查看章节。</p>}
      </aside>
    </section>

    <section className="panel reader">
      <h2>阅读器</h2>
      {props.images.length === 0 ? <p className="muted">打开章节后显示图片，移动端为单列长条模式。</p> : props.images.map((image, index) => <img id={`page-${index + 1}`} key={`${image}-${index}`} src={imageUrl(props.detailSourceKey, image, props.details?.comicId ?? props.details?.id, props.episodeId ?? undefined)} alt={`page ${index + 1}`} loading={index < 2 ? "eager" : "lazy"} />)}
    </section>
  </>;
}

function ComicResultCard(props: { comic: Comic; sourceKey: string; sourceName?: string; onOpenComic: (comic: Comic, sourceKey?: string) => void; onDownloadComic: (comic: Comic, sourceKey?: string) => void }) {
  return <article className="comic-card">
    <img src={imageUrl(props.sourceKey, props.comic.cover ?? "mock://cover/0", props.comic.id, undefined, true)} alt="" />
    {props.sourceName && <span className="source-label">{props.sourceName}</span>}
    <strong>{props.comic.title}</strong>
    <span>{props.comic.description}</span>
    <div className="card-actions"><button onClick={() => props.onOpenComic(props.comic, props.sourceKey)}>详情</button><button onClick={() => props.onDownloadComic(props.comic, props.sourceKey)}>下载全本</button></div>
  </article>;
}
