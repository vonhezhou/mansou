type DownloadActionsProps = {
  selectedEpisodeIds: string[];
  downloadCreateStatus: string | null;
  onPreviewEpisode: () => void;
  onCreateDownload: (mode: "first" | "selected" | "all") => void;
};

export function DownloadActions(props: DownloadActionsProps) {
  return (
    <>
      <div className="actions">
        <button onClick={props.onPreviewEpisode}>预览章节</button>
        <button onClick={() => props.onCreateDownload("first")}>只下载首章</button>
        <button
          onClick={() => props.onCreateDownload("selected")}
          disabled={props.selectedEpisodeIds.length === 0}
        >
          下载所选章节
        </button>
        <button onClick={() => props.onCreateDownload("all")}>下载全本</button>
      </div>
      {props.downloadCreateStatus && <p className="muted">{props.downloadCreateStatus}</p>}
    </>
  );
}
