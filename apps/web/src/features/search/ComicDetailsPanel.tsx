import { imageUrl } from "../../api/venera.js";
import type { Details } from "../../types.js";
import { ChapterSelector } from "./ChapterSelector.js";
import { DownloadActions } from "./DownloadActions.js";

type ComicDetailsPanelProps = {
  detailSourceKey: string;
  details: Details | null;
  episodeId: string | null;
  selectedEpisodeIds: string[];
  downloadCreateStatus: string | null;
  onPreviewEpisode: (episodeId?: string | null) => void;
  onToggleSelectedEpisode: (episodeId: string) => void;
  onSelectEpisodes: (action: "all" | "clear" | "invert") => void;
  onCreateDownload: (mode: "first" | "selected" | "all") => void;
};

export function ComicDetailsPanel(props: ComicDetailsPanelProps) {
  return <aside className="panel details">
    <h2>详情</h2>
    {props.details ? <>
      {props.details.cover && <img className="detail-cover" src={imageUrl(props.detailSourceKey, props.details.cover, props.details.comicId ?? props.details.id, undefined, true)} alt="" />}
      <h3>{props.details.title}</h3>
      <p>{props.details.description}</p>
      <p className="muted">源：{props.detailSourceKey} / 漫画 ID：{props.details.comicId ?? props.details.id}</p>
      <ChapterSelector chapters={props.details.chapters ?? {}} episodeId={props.episodeId} selectedEpisodeIds={props.selectedEpisodeIds} onPreviewEpisode={props.onPreviewEpisode} onToggleSelectedEpisode={props.onToggleSelectedEpisode} onSelectEpisodes={props.onSelectEpisodes} />
      <DownloadActions selectedEpisodeIds={props.selectedEpisodeIds} downloadCreateStatus={props.downloadCreateStatus} onPreviewEpisode={() => props.onPreviewEpisode()} onCreateDownload={props.onCreateDownload} />
    </> : <p className="muted">选择一本漫画查看章节并创建下载任务。</p>}
  </aside>;
}
