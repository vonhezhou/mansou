import { useState } from "react";
import { getDownloadImageKey } from "../../lib/downloads.js";
import type { DownloadItem, DownloadTask } from "../../types.js";

type DownloadItemsListProps = {
  busy: boolean;
  task: DownloadTask;
  items?: DownloadItem[];
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};

const pageSize = 100;

export function DownloadItemsList(props: DownloadItemsListProps) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil((props.items?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, pageCount);
  if (!props.items?.length) return null;

  return (
    <>
      {pageCount > 1 && (
        <nav className="download-pagination" aria-label="下载明细分页">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            上一页明细
          </button>
          <select
            aria-label="下载明细页"
            value={currentPage}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                第 {index + 1} 页
              </option>
            ))}
          </select>
          <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
            下一页明细
          </button>
          <span>
            共 {props.items.length} 条 · 每页 {pageSize} 条
          </span>
        </nav>
      )}
      <div className="download-items">
        {props.items.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item) => {
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
