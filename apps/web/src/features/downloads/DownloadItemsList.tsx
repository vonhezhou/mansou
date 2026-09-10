import { getDownloadImageKey } from "../../lib/downloads.js";
import type { DownloadItem, DownloadTask } from "../../types.js";

type DownloadItemsListProps = {
  busy: boolean;
  task: DownloadTask;
  items?: DownloadItem[];
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};

export function DownloadItemsList(props: DownloadItemsListProps) {
  if (!props.items?.length) return null;

  return (
    <div className="download-items">
      {props.items.map((item) => {
        const imageKey = getDownloadImageKey(item);
        return (
          <div key={imageKey}>
            <span>{imageKey}</span>
            <span>
              {item.status}
              {item.error ? ` / ${item.error}` : ""}
            </span>
            <button
              onClick={() => props.onRetryDownloadItem(props.task, item)}
              disabled={props.busy}
            >
              重试
            </button>
          </div>
        );
      })}
    </div>
  );
}
