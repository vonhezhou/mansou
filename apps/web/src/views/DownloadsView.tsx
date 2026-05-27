import { filterDownloadItems, getDownloadImageKey, getDownloadProgress, groupDownloads } from "../lib/downloads.js";
import type { CacheStats, DownloadItem, DownloadTask } from "../types.js";
import { useState } from "react";

type DownloadAction = "cancel" | "rerun" | "cbz" | "delete" | "delete-files";

type DownloadsViewProps = {
  busy: boolean;
  cache: CacheStats | null;
  downloads: DownloadTask[];
  downloadItems: Record<string, DownloadItem[]>;
  failedItemsOnly: boolean;
  onFailedItemsOnlyChange: (value: boolean) => void;
  onPruneCache: () => void;
  onClearCache: () => void;
  onLoadDownloadItems: (task: DownloadTask) => void;
  onDownloadAction: (task: DownloadTask, action: DownloadAction) => void;
  onRetryDownloadItem: (task: DownloadTask, item: DownloadItem) => void;
};

export function DownloadsView(props: DownloadsViewProps) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [comicFilter, setComicFilter] = useState("");
  const filteredDownloads = props.downloads.filter((task) => {
    const sourceMatched = !sourceFilter || task.sourceKey.toLowerCase().includes(sourceFilter.toLowerCase());
    const comicMatched = !comicFilter || task.comicId.toLowerCase().includes(comicFilter.toLowerCase()) || task.title?.toLowerCase().includes(comicFilter.toLowerCase());
    return sourceMatched && comicMatched;
  });
  const groupedDownloads = groupDownloads(filteredDownloads);

  return <section className="panel downloads">
    <h2>下载任务</h2>
    {props.downloads.length === 0 && <p className="muted">暂无下载任务。</p>}
    {props.cache && <p className="muted">图片缓存：{props.cache.files} 个文件，{(props.cache.bytes / 1024 / 1024).toFixed(2)} MB <button onClick={props.onPruneCache}>按限制裁剪</button> <button onClick={props.onClearCache}>清理缓存</button></p>}
    <div className="download-filters"><label>来源筛选<input value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} placeholder="sourceKey" /></label><label>漫画筛选<input value={comicFilter} onChange={(event) => setComicFilter(event.target.value)} placeholder="漫画 ID 或标题" /></label></div>
    <label className="inline-toggle"><input checked={props.failedItemsOnly} onChange={(event) => props.onFailedItemsOnlyChange(event.target.checked)} type="checkbox" /> 下载明细只看失败项</label>
    {props.downloads.length > 0 && filteredDownloads.length === 0 && <p className="muted">没有匹配当前筛选条件的下载任务。</p>}
    {groupedDownloads.map((group) => <div className="download-group" key={group.key}><h3>{group.title}</h3>{group.tasks.map((task) => {
      const items = filterDownloadItems(props.downloadItems[task.id], props.failedItemsOnly);
      return <article key={task.id}><strong>{task.title ?? task.comicId}</strong><span>{task.status} / {task.phase} / {getDownloadProgress(task)}%</span><div className="task-meta"><span>来源：{task.sourceKey}</span><span>漫画 ID：{task.comicId}</span><span>范围：{downloadScope(task)}</span><span>创建：{formatTime(task.createdAt)}</span><span>任务 ID：{task.id}</span></div><progress value={task.completed} max={Math.max(task.total, 1)} />{task.outputDir && <small className="muted">{task.outputDir}</small>}{task.error && <small>{task.error}</small>}<div className="actions"><button onClick={() => props.onLoadDownloadItems(task)}>明细</button><button onClick={() => props.onDownloadAction(task, "cancel")}>取消</button><button onClick={() => props.onDownloadAction(task, "rerun")}>重跑</button><button onClick={() => props.onDownloadAction(task, "cbz")}>导出 CBZ</button><button onClick={() => props.onDownloadAction(task, "delete")}>删除</button><button onClick={() => props.onDownloadAction(task, "delete-files")}>删除+文件</button></div>{task.logs?.length ? <small className="muted">{task.logs.at(-1)?.message}</small> : null}{items?.length ? <div className="download-items">{items.map((item) => { const imageKey = getDownloadImageKey(item); return <div key={imageKey}><span>{imageKey}</span><span>{item.status}{item.error ? ` / ${item.error}` : ""}</span><button onClick={() => props.onRetryDownloadItem(task, item)} disabled={props.busy}>重试</button></div>; })}</div> : null}</article>;
    })}</div>)}
  </section>;
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
