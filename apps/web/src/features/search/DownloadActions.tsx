type DownloadActionsProps = {
  selectedEpisodeIds: string[];
  downloadCreateStatus: string | null;
  onPreviewEpisode: () => void;
  onCreateDownload: (mode: "first" | "selected" | "all") => void;
};

export function DownloadActions(props: DownloadActionsProps) {
  return (
    <>
      <p className="muted download-destination-note">
        以下操作会将内容保存到 NAS，浏览器关闭后仍会继续。完成后可在“下载中心”下载到本机。
      </p>
      <div className="actions">
        <button onClick={props.onPreviewEpisode}>预览章节</button>
        <button onClick={() => props.onCreateDownload("first")}>保存首章到服务器</button>
        <button
          onClick={() => props.onCreateDownload("selected")}
          disabled={props.selectedEpisodeIds.length === 0}
        >
          保存所选章节到服务器
        </button>
        <button onClick={() => props.onCreateDownload("all")}>保存全本到服务器</button>
      </div>
      {props.downloadCreateStatus && <p className="muted">{props.downloadCreateStatus}</p>}
    </>
  );
}
