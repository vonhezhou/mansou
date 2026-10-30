import { getDownloadImageKey } from "../../lib/downloads.js";
import type { DownloadItem, DownloadItemsPage, DownloadTask } from "../../types.js";

type DownloadItemsListProps = {
  busy: boolean;
  task: DownloadTask;
  page?: DownloadItemsPage;
  onPageChange: (offset: number) => void;
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};

export function DownloadItemsList(props: DownloadItemsListProps) {
  const data = props.page;
  if (!data?.items.length) return null;
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit));
  const currentPage = Math.floor(data.offset / data.limit) + 1;
  return (
    <>
      {pageCount > 1 && (
        <nav className="download-pagination" aria-label="下载明细分页">
          <button
            disabled={props.busy || currentPage === 1}
            onClick={() => props.onPageChange(data.offset - data.limit)}
          >
            上一页明细
          </button>
          <select
            aria-label="下载明细页"
            value={currentPage}
            disabled={props.busy}
            onChange={(event) => props.onPageChange((Number(event.target.value) - 1) * data.limit)}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                第 {index + 1} 页
              </option>
            ))}
          </select>
          <button
            disabled={props.busy || currentPage === pageCount}
            onClick={() => props.onPageChange(data.offset + data.limit)}
          >
            下一页明细
          </button>
          <span>
            共 {data.total} 条 · 每页 {data.limit} 条
          </span>
        </nav>
      )}
      <div className="download-items">
        {data.items.map((item) => {
          const imageKey = getDownloadImageKey(item);
          return (
            <div key={imageKey}>
              <span>{imageKey}</span>
              <span>
                {{ completed: "已下载", failed: "失败", queued: "等待中", running: "下载中" }[
                  item.status
                ] ?? item.status}
                {item.error ? ` / ${item.error}` : ""}
              </span>
              <button
                onClick={() => props.onRetryDownloadItem(props.task, item)}
                disabled={props.busy || ["queued", "running"].includes(props.task.status)}
                title={
                  ["queued", "running"].includes(props.task.status)
                    ? "请先暂停任务再重试图片"
                    : undefined
                }
              >
                重试
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
