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
  const items = filterDownloadItems(props.items, props.failedItemsOnly);

  return <article>
    <strong>{props.task.title ?? props.task.comicId}</strong><span className="status-badge">{props.task.status} / {props.task.phase} / {getDownloadProgress(props.task)}%</span>
    <div className="task-meta"><span>来源：{props.task.sourceKey}</span><span>漫画 ID：{props.task.comicId}</span><span>范围：{downloadScope(props.task)}</span><span>创建：{formatTime(props.task.createdAt)}</span><span>任务 ID：{props.task.id}</span></div>
    <progress value={props.task.completed} max={Math.max(props.task.total, 1)} />
    {props.task.outputDir && <small className="muted">{props.task.outputDir}</small>}{props.task.error && <small>{props.task.error}</small>}
    <div className="actions"><button onClick={() => props.onLoadDownloadItems(props.task)}>明细</button><button onClick={() => props.onDownloadAction(props.task, "cancel")}>取消</button><button onClick={() => props.onDownloadAction(props.task, "rerun")}>重跑</button><button className="accent" onClick={() => props.onDownloadAction(props.task, "cbz")}>导出 CBZ</button><button className="danger" onClick={() => props.onDownloadAction(props.task, "delete")}>删除</button><button className="danger" onClick={() => props.onDownloadAction(props.task, "delete-files")}>删除+文件</button></div>
    {props.task.logs?.length ? <small className="muted">{props.task.logs.at(-1)?.message}</small> : null}
    <DownloadItemsList busy={props.busy} task={props.task} items={items} onRetryDownloadItem={props.onRetryDownloadItem} />
  </article>;
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
