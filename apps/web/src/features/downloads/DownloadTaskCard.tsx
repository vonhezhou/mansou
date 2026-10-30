import { LoadingStatus } from "../../app/LoadingStatus.js";
import { Icon } from "../../app/Icon.js";
import { useEffect } from "react";
import { getDownloadProgress } from "../../lib/downloads.js";
import type { DownloadItem, DownloadItemsPage, DownloadTask } from "../../types.js";
import { DownloadItemsList } from "./DownloadItemsList.js";
import type { DownloadAction } from "./types.js";

type DownloadTaskCardProps = {
  busy: boolean;
  operation?: string;
  message?: string;
  error?: string;
  itemError?: string;
  task: DownloadTask;
  itemPage?: DownloadItemsPage;
  showDetails: boolean;
  onShowDetailsChange: (show: boolean) => void;
  failedItemsOnly: boolean;
  onLoadDownloadItems: (task: DownloadTask, offset?: number) => void;
  onDownloadAction: (task: DownloadTask, action: DownloadAction) => void;
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};

export function DownloadTaskCard(props: DownloadTaskCardProps) {
  const showDetails = props.showDetails;
  const items = props.itemPage?.items;
  useEffect(() => {
    if (showDetails && !props.itemPage && !props.busy && !props.itemError)
      props.onLoadDownloadItems(props.task);
  }, [showDetails, props.itemPage, props.busy, props.itemError, props.failedItemsOnly]);

  return (
    <article className="download-card" data-status={props.task.status}>
      <header className="download-card-header">
        <span className="download-icon" aria-hidden="true">
          <Icon name="download" size={24} />
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
          value={props.task.totalKnown === false ? undefined : props.task.completed}
          max={Math.max(props.task.total, 1)}
        />
        <span>
          {props.task.totalKnown === false
            ? `已完成 ${props.task.completed} / 已发现 ${props.task.total} 页，总页数待确认`
            : `${getDownloadProgress(props.task)}%`}
        </span>
      </div>
      {props.task.error && (
        <p className="task-error" role="status">
          {props.task.error}
        </p>
      )}
      {props.operation && <LoadingStatus label={props.operation} />}
      {!props.operation && props.error && (
        <p className="task-error" role="alert">
          操作未完成：{props.error}
        </p>
      )}
      {!props.operation && props.message && (
        <p className="muted" role="status">
          {props.message}
        </p>
      )}
      <footer className="download-card-footer">
        <span className="muted">{formatTime(props.task.createdAt)}</span>
        <div className="task-actions">
          <button
            className="secondary-button"
            aria-expanded={showDetails}
            disabled={props.busy}
            onClick={() => {
              if (!showDetails) props.onLoadDownloadItems(props.task, props.itemPage?.offset ?? 0);
              props.onShowDetailsChange(!showDetails);
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
          ) : ["paused", "failed"].includes(props.task.status) ? (
            <button
              disabled={props.busy}
              onClick={() => props.onDownloadAction(props.task, "resume")}
            >
              {props.task.status === "paused" ? "继续下载" : "重试下载"}
            </button>
          ) : ["queued", "running"].includes(props.task.status) ? (
            <>
              <button
                className="secondary-button"
                disabled={props.busy}
                onClick={() => props.onDownloadAction(props.task, "pause")}
              >
                暂停下载
              </button>
              <button
                className="secondary-button"
                disabled={props.busy}
                onClick={() => props.onDownloadAction(props.task, "cancel")}
              >
                取消下载
              </button>
            </>
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
              <dd>{phaseLabel(props.task.phase)}</dd>
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
          {props.itemError && (
            <div className="alert" role="alert">
              <p>{props.itemError}</p>
              <button disabled={props.busy} onClick={() => props.onLoadDownloadItems(props.task)}>
                重新加载明细
              </button>
            </div>
          )}
          {!props.itemError && props.itemPage && items?.length === 0 && (
            <p className="muted">
              {props.failedItemsOnly ? "没有失败的图片。" : "还没有图片下载记录。"}
            </p>
          )}
          <DownloadItemsList
            busy={props.busy}
            task={props.task}
            page={props.itemPage}
            onPageChange={(offset) => props.onLoadDownloadItems(props.task, offset)}
            onRetryDownloadItem={props.onRetryDownloadItem}
          />
          <div className="task-actions">
            {!["queued", "running"].includes(props.task.status) &&
              Boolean(props.itemPage?.failedTotal) && (
                <button
                  className="secondary-button"
                  disabled={props.busy}
                  onClick={() => props.onDownloadAction(props.task, "retry-failed")}
                >
                  重试失败图片
                </button>
              )}
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
        paused: "已暂停",
        completed: "已完成",
        done: "已完成",
        failed: "失败",
        cancelled: "已取消",
        canceled: "已取消",
      } as Record<string, string>
    )[status] ?? status
  );
}

function phaseLabel(phase: string) {
  return (
    (
      {
        queued: "等待执行",
        loading_details: "正在获取漫画详情",
        loading_pages: "正在解析章节",
        downloading_images: "正在下载图片",
        writing_metadata: "正在保存漫画信息",
        completed: "已完成",
        paused: "已暂停",
        cancelled: "已取消",
        failed: "下载失败",
      } as Record<string, string>
    )[phase] ?? "处理中"
  );
}
