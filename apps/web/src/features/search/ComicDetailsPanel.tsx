import { AsyncImage } from "../../app/AsyncImage.js";
import { imageUrl } from "../../api/venera.js";
import type { Details } from "../../types.js";
import { ChapterSelector } from "./ChapterSelector.js";
import { DownloadActions } from "./DownloadActions.js";

type ComicDetailsPanelProps = {
  detailSourceKey: string;
  details: Details | null;
  episodeId: string | null;
  selectedEpisodeIds: string[];
  episodePageCounts: Record<string, number>;
  downloadCreateStatus: string | null;
  onPreviewEpisode: (episodeId?: string | null) => void;
  onCountAllPages: () => void;
  onToggleSelectedEpisode: (episodeId: string) => void;
  onSelectEpisodes: (action: "all" | "clear" | "invert") => void;
  onCreateDownload: (mode: "first" | "selected" | "all") => void;
};

export function ComicDetailsPanel(props: ComicDetailsPanelProps) {
  const chapterIds = Object.keys(props.details?.chapters ?? {});
  const countedChapterCount = chapterIds.filter(
    (id) => props.episodePageCounts[id] !== undefined,
  ).length;
  const countedPageCount = Object.values(props.episodePageCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const allPagesCounted = chapterIds.length > 0 && countedChapterCount === chapterIds.length;

  return (
    <aside className="panel details">
      {props.details ? (
        <>
          <div className="detail-heading">
            {props.details.cover && (
              <AsyncImage
                className="detail-cover"
                animate
                loading="eager"
                src={imageUrl(
                  props.detailSourceKey,
                  props.details.cover,
                  props.details.comicId ?? props.details.id,
                  undefined,
                  true,
                )}
                alt=""
              />
            )}
            <div>
              <h2>{props.details.title}</h2>
              <p>{props.details.description}</p>
              <p className="muted">
                {props.detailSourceKey} · 共 {chapterIds.length} 章
              </p>
            </div>
          </div>
          <details className="disclosure">
            <summary>章节页数统计</summary>
            <div className="comic-stats">
              <span>共 {chapterIds.length} 章</span>
              <span>
                {allPagesCounted
                  ? `共 ${countedPageCount} 页`
                  : `已统计 ${countedChapterCount}/${chapterIds.length} 章，${countedPageCount} 页`}
              </span>
            </div>
            {chapterIds.length > 0 && !allPagesCounted && (
              <button className="secondary-action" onClick={props.onCountAllPages}>
                统计全部章节页数
              </button>
            )}
          </details>
          {chapterIds.length === 0 && (
            <button onClick={() => props.onPreviewEpisode()}>预览内容</button>
          )}
          <ChapterSelector
            key={`${props.detailSourceKey}:${props.details.comicId ?? props.details.id}`}
            chapters={props.details.chapters ?? {}}
            episodeId={props.episodeId}
            selectedEpisodeIds={props.selectedEpisodeIds}
            episodePageCounts={props.episodePageCounts}
            onPreviewEpisode={props.onPreviewEpisode}
            onToggleSelectedEpisode={props.onToggleSelectedEpisode}
            onSelectEpisodes={props.onSelectEpisodes}
          />
          <DownloadActions
            selectedEpisodeIds={props.selectedEpisodeIds}
            downloadCreateStatus={props.downloadCreateStatus}
            onCreateDownload={props.onCreateDownload}
          />
        </>
      ) : (
        <p className="muted">选择一本漫画查看章节并创建下载任务。</p>
      )}
    </aside>
  );
}
