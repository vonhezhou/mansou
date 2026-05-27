import { AggregateSourcePicker } from "./AggregateSourcePicker.js";
import { ChapterPreview } from "./ChapterPreview.js";
import { ComicDetailsPanel } from "./ComicDetailsPanel.js";
import { SearchControls } from "./SearchControls.js";
import { SearchResults } from "./SearchResults.js";
import type { SearchViewProps } from "./types.js";

export function SearchView(props: SearchViewProps) {
  return <>
    <SearchControls busy={props.busy} sourceKey={props.sourceKey} sources={props.sources} keyword={props.keyword} searchMode={props.searchMode} aggregateSourceKeys={props.aggregateSourceKeys} onSourceChange={props.onSourceChange} onKeywordChange={props.onKeywordChange} onSearchModeChange={props.onSearchModeChange} onSearch={props.onSearch} />
    {props.searchMode === "aggregate" && <AggregateSourcePicker sources={props.sources} aggregateSourceKeys={props.aggregateSourceKeys} onToggleAggregateSource={props.onToggleAggregateSource} />}
    <section className="grid">
      <SearchResults busy={props.busy} sourceKey={props.sourceKey} searchMode={props.searchMode} aggregateResultLayout={props.aggregateResultLayout} results={props.results} aggregatedResults={props.aggregatedResults} hasSearched={props.hasSearched} searchPage={props.searchPage} searchMaxPage={props.searchMaxPage} canLoadMore={props.canLoadMore} onAggregateResultLayoutChange={props.onAggregateResultLayoutChange} onLoadMore={props.onLoadMore} onOpenComic={props.onOpenComic} onDownloadComic={props.onDownloadComic} />
      <ComicDetailsPanel detailSourceKey={props.detailSourceKey} details={props.details} episodeId={props.episodeId} selectedEpisodeIds={props.selectedEpisodeIds} downloadCreateStatus={props.downloadCreateStatus} onPreviewEpisode={props.onPreviewEpisode} onToggleSelectedEpisode={props.onToggleSelectedEpisode} onSelectEpisodes={props.onSelectEpisodes} onCreateDownload={props.onCreateDownload} />
    </section>
    <ChapterPreview detailSourceKey={props.detailSourceKey} details={props.details} episodeId={props.episodeId} previewImages={props.previewImages} />
  </>;
}
