import { useEffect, useRef } from "react";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { SourcePicker } from "./SourcePicker.js";
import { ChapterPreview } from "./ChapterPreview.js";
import { ComicDetailsPanel } from "./ComicDetailsPanel.js";
import { SearchControls } from "./SearchControls.js";
import { SearchResults } from "./SearchResults.js";
import type { SearchViewProps } from "./types.js";

export function SearchView(props: SearchViewProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resultSourceKey = props.searchQuery?.sourceKey ?? props.sourceKey;
  const dialogOpen = Boolean(props.details || props.pendingComic);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialogOpen || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [dialogOpen]);

  return (
    <>
      <section className="search-hero">
        <SearchControls
          busy={props.busy}
          searching={props.searching}
          onCancelSearch={props.onCancelSearch}
          sourceKey={props.sourceKey}
          sources={props.sources}
          keyword={props.keyword}
          searchMode={props.searchMode}
          aggregateSourceKeys={props.aggregateSourceKeys}
          onKeywordChange={props.onKeywordChange}
          onSearchModeChange={props.onSearchModeChange}
          onSearch={props.onSearch}
        />
        <SourcePicker
          sources={props.sources}
          searchMode={props.searchMode}
          sourceKey={props.sourceKey}
          aggregateSourceKeys={props.aggregateSourceKeys}
          busy={props.busy || Boolean(props.sourcesLoading)}
          onSourceChange={props.onSourceChange}
          onToggleAggregateSource={props.onToggleAggregateSource}
        />
      </section>
      <SearchResults
        sourceName={props.sources.find((source) => source.key === resultSourceKey)?.name}
        keyword={props.searchQuery?.keyword}
        busy={props.busy}
        searchError={props.searchError}
        searchCancelled={props.searchCancelled}
        interactionBusy={props.detailsBusy ?? (props.busy && !props.searching)}
        pendingSourceKeys={props.aggregatePendingKeys}
        sourceKey={resultSourceKey}
        searchMode={props.searchQuery?.mode ?? props.searchMode}
        aggregateResultLayout={props.aggregateResultLayout}
        results={props.results}
        aggregatedResults={props.aggregatedResults}
        hasSearched={props.hasSearched}
        searchPage={props.searchPage}
        searchMaxPage={props.searchMaxPage}
        canLoadMore={props.canLoadMore}
        onAggregateResultLayoutChange={props.onAggregateResultLayoutChange}
        onLoadMore={props.onLoadMore}
        onOpenComic={(comic, sourceKey) => {
          returnFocusRef.current = document.activeElement as HTMLElement;
          props.onOpenComic(comic, sourceKey);
        }}
      />
      {dialogOpen && (
        <dialog
          ref={dialogRef}
          className="comic-dialog"
          aria-label="漫画详情"
          aria-busy={props.loadingDetails}
          onCancel={props.onCloseDetails}
        >
          <div className="dialog-header">
            <span>漫画详情</span>
            <button className="quiet-button" autoFocus onClick={props.onCloseDetails}>
              关闭
            </button>
          </div>
          {props.pendingComic && (
            <div className="detail-pending">
              <h2>{props.pendingComic.comic.title}</h2>
              {props.detailError ? (
                <div className="alert" role="alert">
                  <p>{props.detailError}</p>
                  <button
                    onClick={() =>
                      props.onOpenComic(props.pendingComic!.comic, props.pendingComic!.sourceKey)
                    }
                  >
                    重试加载详情
                  </button>
                </div>
              ) : (
                <LoadingStatus label="正在加载漫画详情与章节…" />
              )}
            </div>
          )}
          {props.details && props.detailWorkError && (
            <div className="alert detail-operation" role="alert">
              <p>{props.detailWorkError}</p>
              <button onClick={props.onRetryPreview}>重试加载章节</button>
            </div>
          )}
          {props.details && (props.detailOperation || props.detailSummary) && (
            <div className="detail-operation">
              {props.detailOperation ? (
                <LoadingStatus label={props.detailOperation} />
              ) : (
                <span role="status">{props.detailSummary}</span>
              )}
              {props.countingPages && (
                <button className="secondary-button" onClick={props.onStopCounting}>
                  停止统计，保留已有结果
                </button>
              )}
            </div>
          )}
          {props.details && (
            <fieldset disabled={props.detailsBusy ?? props.busy} className="detail-content">
              <ComicDetailsPanel
                detailSourceKey={props.detailSourceKey}
                details={props.details}
                episodeId={props.episodeId}
                selectedEpisodeIds={props.selectedEpisodeIds}
                episodePageCounts={props.episodePageCounts}
                downloadCreateStatus={props.detailOperation ? null : props.downloadCreateStatus}
                onPreviewEpisode={props.onPreviewEpisode}
                onCountAllPages={props.onCountAllPages}
                onToggleSelectedEpisode={props.onToggleSelectedEpisode}
                onSelectEpisodes={props.onSelectEpisodes}
                onCreateDownload={props.onCreateDownload}
              />
              {props.previewImages.length > 0 && (
                <ChapterPreview
                  detailSourceKey={props.detailSourceKey}
                  details={props.details}
                  episodeId={props.episodeId}
                  previewImages={props.previewImages}
                />
              )}
            </fieldset>
          )}
        </dialog>
      )}
    </>
  );
}
