import { useState } from "react";
import { filterDownloadItems, getDownloadProgress } from "../../lib/downloads.js";
import type { DownloadItem, DownloadTask } from "../../types.js";
import { DownloadItemsList } from "./DownloadItemsList.js";
import type { DownloadAction } from "./types.js";

type DownloadTaskCardProps = {
  busy: boolean;
  task: DownloadTask;
  items?: DownloadItem[];
  failedItemsOnly: boolean;
  onLoadDownloadItems: (task: DownloadTask) => void;
  onDownloadAction: (task: DownloadTask, action: DownloadAction) => void;
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};

export function DownloadTaskCard(props: DownloadTaskCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const items = filterDownloadItems(props.items, props.failedItemsOnly);

  return (
    <article className="download-card" data-status={props.task.status}>
      <header className="download-card-header">
        <span className="download-icon" aria-hidden="true">
          ↓
        </span>
        <div className="download-title">
          <strong>{props.task.title ?? props.task.comicId}</strong>
          <span className="muted">
            {props.task.sourceKey} · {downloadScope(props.task)}
          </span>
        </div>
        <span className="status-badge">{statusLabel(props.task.status)}</span>
      </header>
      <div className="download-progress">
        <progress
          aria-label="下载进度"
          value={props.task.completed}
          max={Math.max(props.task.total, 1)}
        />
        <span>{getDownloadProgress(props.task)}%</span>
      </div>
      {props.task.error && (
        <p className="task-error" role="status">
          {props.task.error}
        </p>
      )}
      <footer className="download-card-footer">
        <span className="muted">{formatTime(props.task.createdAt)}</span>
        <div className="task-actions">
          <button
            className="secondary-button"
            aria-expanded={showDetails}
            onClick={() => {
              if (!showDetails) props.onLoadDownloadItems(props.task);
              setShowDetails(!showDetails);
            }}
          >
            {showDetails ? "收起详情" : "任务详情"}
          </button>
          {props.task.status === "completed" ? (
            <button
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "download-local")}
            >
              下载到本机
            </button>
          ) : ["queued", "running"].includes(props.task.status) ? (
            <button
              className="secondary-button"
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "cancel")}
            >
              取消下载
            </button>
          ) : (
            <button
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "rerun")}
            >
              重新下载
            </button>
          )}
        </div>
      </footer>
      {showDetails && (
        <div className="task-details">
          <dl className="task-meta">
            <div>
              <dt>漫画 ID</dt>
              <dd>{props.task.comicId}</dd>
            </div>
            <div>
              <dt>任务 ID</dt>
              <dd>{props.task.id}</dd>
            </div>
            <div>
              <dt>阶段</dt>
              <dd>{props.task.phase}</dd>
            </div>
            {props.task.outputDir && (
              <div>
                <dt>保存位置</dt>
                <dd>{props.task.outputDir}</dd>
              </div>
            )}
          </dl>
          {props.task.logs?.length ? (
            <p className="muted">{props.task.logs.at(-1)?.message}</p>
          ) : null}
          <DownloadItemsList
            busy={props.busy}
            task={props.task}
            items={items}
            onRetryDownloadItem={props.onRetryDownloadItem}
          />
          <div className="task-actions">
            <button
              className="secondary-button"
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "rerun")}
            >
              重跑任务
            </button>
            <button
              className="danger-subtle"
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "delete")}
            >
              删除任务
            </button>
            <button
              className="danger-subtle"
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "delete-files")}
            >
              删除任务与文件
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function downloadScope(task: DownloadTask) {
  if (task.all || task.episodeId === "__all__") return "全本";
  return task.episodeId ? `章节 ${task.episodeId}` : "首章";
}

function formatTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(status: string) {
  return (
    (
      {
        queued: "等待中",
        running: "下载中",
        completed: "已完成",
        done: "已完成",
        failed: "失败",
        cancelled: "已取消",
        canceled: "已取消",
      } as Record<string, string>
    )[status] ?? status
  );
}
