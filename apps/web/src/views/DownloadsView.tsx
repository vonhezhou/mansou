import { filterDownloadItems, getDownloadImageKey, getDownloadProgress, groupDownloads } from "../lib/downloads.js";
import type { CacheStats, DownloadItem, DownloadTask } from "../types.js";

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
  const groupedDownloads = groupDownloads(props.downloads);

  return <section className="panel downloads">
    <h2>下载任务</h2>
    {props.downloads.length === 0 && <p className="muted">暂无下载任务。</p>}
    {props.cache && <p className="muted">图片缓存：{props.cache.files} 个文件，{(props.cache.bytes / 1024 / 1024).toFixed(2)} MB <button onClick={props.onPruneCache}>按限制裁剪</button> <button onClick={props.onClearCache}>清理缓存</button></p>}
    <label className="inline-toggle"><input checked={props.failedItemsOnly} onChange={(event) => props.onFailedItemsOnlyChange(event.target.checked)} type="checkbox" /> 下载明细只看失败项</label>
    {groupedDownloads.map((group) => <div className="download-group" key={group.key}><h3>{group.title}</h3>{group.tasks.map((task) => {
      const items = filterDownloadItems(props.downloadItems[task.id], props.failedItemsOnly);
      return <article key={task.id}><strong>{task.title ?? task.comicId}</strong><span>{task.status} / {task.phase} / {getDownloadProgress(task)}%</span><progress value={task.completed} max={Math.max(task.total, 1)} />{task.error && <small>{task.error}</small>}<div className="actions"><button onClick={() => props.onLoadDownloadItems(task)}>明细</button><button onClick={() => props.onDownloadAction(task, "cancel")}>取消</button><button onClick={() => props.onDownloadAction(task, "rerun")}>重跑</button><button onClick={() => props.onDownloadAction(task, "cbz")}>导出 CBZ</button><button onClick={() => props.onDownloadAction(task, "delete")}>删除</button><button onClick={() => props.onDownloadAction(task, "delete-files")}>删除+文件</button></div>{task.logs?.length ? <small className="muted">{task.logs.at(-1)?.message}</small> : null}{items?.length ? <div className="download-items">{items.map((item) => { const imageKey = getDownloadImageKey(item); return <div key={imageKey}><span>{imageKey}</span><span>{item.status}{item.error ? ` / ${item.error}` : ""}</span><button onClick={() => props.onRetryDownloadItem(task, item)} disabled={props.busy}>重试</button></div>; })}</div> : null}</article>;
    })}</div>)}
  </section>;
}
