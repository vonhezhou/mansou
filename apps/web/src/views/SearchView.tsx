import type { Comic } from "@venera/contracts";
import { imageUrl } from "../api/venera.js";
import type { AggregatedSearchItem, Details, Source } from "../types.js";

type SearchViewProps = {
  busy: boolean;
  sourceKey: string;
  sources: Source[];
  keyword: string;
  searchMode: "single" | "aggregate";
  results: Comic[];
  aggregatedResults: AggregatedSearchItem[];
  details: Details | null;
  episodeId: string | null;
  images: string[];
  hasSearched: boolean;
  searchPage: number;
  searchMaxPage?: number;
  canLoadMore: boolean;
  onSourceChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onSearchModeChange: (value: "single" | "aggregate") => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onOpenComic: (comic: Comic, sourceKey?: string) => void;
  onDownloadComic: (comic: Comic, sourceKey?: string) => void;
  onReadEpisode: (episodeId?: string | null) => void;
  onCreateDownload: (all: boolean) => void;
};

export function SearchView(props: SearchViewProps) {
  const aggregateCount = props.aggregatedResults.reduce((count, item) => count + (item.result?.comics.length ?? 0), 0);

  return <>
    <section className="panel controls">
      <label>搜索模式<select value={props.searchMode} onChange={(event) => props.onSearchModeChange(event.target.value as "single" | "aggregate")}><option value="single">单源搜索</option><option value="aggregate">聚合搜索</option></select></label>
      <label>源<select value={props.sourceKey} onChange={(event) => props.onSourceChange(event.target.value)}>{props.sources.map((source) => <option key={source.key} value={source.key}>{source.name} ({source.key})</option>)}</select></label>
      <label>关键词<input value={props.keyword} onChange={(event) => props.onKeywordChange(event.target.value)} placeholder="输入关键词" /></label>
      <button onClick={props.onSearch} disabled={props.busy || !props.sourceKey}>搜索</button>
    </section>

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
        {props.searchMode === "aggregate" && <div className="aggregate-results">{props.aggregatedResults.map((item) => <section className="aggregate-source" key={item.sourceKey}><header><h3>{item.sourceName}</h3><span className="muted">{item.sourceKey}{item.error ? ` / ${item.error}` : ` / ${item.result?.comics.length ?? 0} 项`}</span></header>{item.result?.comics.length ? <div className="cards">{item.result.comics.map((comic) => <ComicResultCard comic={comic} key={`${item.sourceKey}:${comic.id}`} sourceKey={item.sourceKey} onOpenComic={props.onOpenComic} onDownloadComic={props.onDownloadComic} />)}</div> : null}</section>)}</div>}
      </div>

      <aside className="panel details">
        <h2>详情</h2>
        {props.details ? <>
          {props.details.cover && <img className="detail-cover" src={imageUrl(props.sourceKey, props.details.cover, props.details.comicId ?? props.details.id, undefined, true)} alt="" />}
          <h3>{props.details.title}</h3>
          <p>{props.details.description}</p>
          <p className="muted">漫画 ID：{props.details.comicId ?? props.details.id}</p>
          <div className="chips">{Object.entries(props.details.chapters ?? {}).map(([id, title]) => <button className={id === props.episodeId ? "active" : ""} key={id} onClick={() => props.onReadEpisode(id)}>{title}</button>)}</div>
          <div className="actions"><button onClick={() => props.onReadEpisode()}>开始阅读</button><button onClick={() => props.onCreateDownload(false)}>下载章节</button><button onClick={() => props.onCreateDownload(true)}>下载全本</button></div>
        </> : <p className="muted">选择一本漫画查看章节。</p>}
      </aside>
    </section>

    <section className="panel reader">
      <h2>阅读器</h2>
      {props.images.length === 0 ? <p className="muted">打开章节后显示图片，移动端为单列长条模式。</p> : props.images.map((image, index) => <img id={`page-${index + 1}`} key={`${image}-${index}`} src={imageUrl(props.sourceKey, image, props.details?.comicId ?? props.details?.id, props.episodeId ?? undefined)} alt={`page ${index + 1}`} loading={index < 2 ? "eager" : "lazy"} />)}
    </section>
  </>;
}

function ComicResultCard(props: { comic: Comic; sourceKey: string; onOpenComic: (comic: Comic, sourceKey?: string) => void; onDownloadComic: (comic: Comic, sourceKey?: string) => void }) {
  return <article className="comic-card">
    <img src={imageUrl(props.sourceKey, props.comic.cover ?? "mock://cover/0", props.comic.id, undefined, true)} alt="" />
    <strong>{props.comic.title}</strong>
    <span>{props.comic.description}</span>
    <div className="card-actions"><button onClick={() => props.onOpenComic(props.comic, props.sourceKey)}>详情</button><button onClick={() => props.onDownloadComic(props.comic, props.sourceKey)}>下载全本</button></div>
  </article>;
}
