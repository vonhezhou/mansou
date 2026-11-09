import { useState } from "react";
import { DownloadDirectoryField } from "../../app/DownloadDirectoryField.js";

type DownloadActionsProps = {
  selectedEpisodeIds: string[];
  downloadCreateStatus: string | null;
  onCreateDownload: (mode: "first" | "selected" | "all", downloadDir?: string) => void;
};

export function DownloadActions(props: DownloadActionsProps) {
  const [directory, setDirectory] = useState("");
  return (
    <>
      <DownloadDirectoryField value={directory} onChange={setDirectory} />
      <p className="muted download-destination-note">
        下载在服务器后台运行，完成后可在下载中心获取文件。
      </p>
      <div className="actions download-actions">
        <button
          onClick={() => props.onCreateDownload("selected", directory.trim() || undefined)}
          disabled={props.selectedEpisodeIds.length === 0}
        >
          下载所选章节
        </button>
        <button onClick={() => props.onCreateDownload("all", directory.trim() || undefined)}>
          下载全本
        </button>
      </div>
      {props.downloadCreateStatus && (
        <p className="muted" role="status">
          {props.downloadCreateStatus}
        </p>
      )}
    </>
  );
}
