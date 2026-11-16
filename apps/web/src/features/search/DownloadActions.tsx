import { useState } from "react";
import { DownloadDestinationField } from "../../app/DownloadDestinationField.js";

type DownloadActionsProps = {
  selectedEpisodeIds: string[];
  downloadCreateStatus: string | null;
  onCreateDownload: (
    mode: "first" | "selected" | "all",
    destination?: "public" | "personal",
  ) => void;
};

export function DownloadActions(props: DownloadActionsProps) {
  const [destination, setDestination] = useState<"public" | "personal" | undefined>();
  return (
    <>
      <DownloadDestinationField value={destination} onChange={setDestination} />
      <p className="muted download-destination-note">
        下载在服务器后台运行，完成后可在下载中心获取文件。
      </p>
      <div className="actions download-actions">
        <button
          onClick={() => props.onCreateDownload("selected", destination)}
          disabled={!destination || props.selectedEpisodeIds.length === 0}
        >
          下载所选章节
        </button>
        <button disabled={!destination} onClick={() => props.onCreateDownload("all", destination)}>
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
