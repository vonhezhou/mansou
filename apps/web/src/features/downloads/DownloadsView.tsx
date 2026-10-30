import { useState } from "react";
import { groupDownloads } from "../../lib/downloads.js";
import { CachePanel } from "./CachePanel.js";
import { DownloadSummary } from "./DownloadSummary.js";
import { DownloadTaskCard } from "./DownloadTaskCard.js";
import type { DownloadsViewProps } from "./types.js";

export function DownloadsView(props: DownloadsViewProps) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [comicFilter, setComicFilter] = useState("");
  const filteredDownloads = props.downloads.filter((task) => {
    const sourceMatched =
      !sourceFilter || task.sourceKey.toLowerCase().includes(sourceFilter.toLowerCase());
    const comicMatched =
      !comicFilter ||
      task.comicId.toLowerCase().includes(comicFilter.toLowerCase()) ||
      task.title?.toLowerCase().includes(comicFilter.toLowerCase());
    return sourceMatched && comicMatched;
  });
  const groupedDownloads = groupDownloads(filteredDownloads);

  return (
    <section className="inner-page downloads">
      <header className="page-title">
        <div>
          <span className="eyebrow">DOWNLOAD MANAGER</span>
          <h1>下载任务</h1>
          <p>管理服务器上的漫画下载与队列，完成后可获取 CBZ 文件。</p>
        </div>
      </header>
      <DownloadSummary downloads={props.downloads} />
      <div className="download-tools">
        <details className="disclosure">
          <summary>图片缓存管理</summary>
          <CachePanel
            cache={props.cache}
            operation={props.cacheOperation}
            onPruneCache={props.onPruneCache}
            onClearCache={props.onClearCache}
          />
        </details>
        {!props.busy && props.downloads.length === 0 && <p className="muted">暂无下载任务。</p>}
        <details className="disclosure">
          <summary>筛选下载任务</summary>
          <div className="download-filters">
            <label>
              来源筛选
              <input
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                placeholder="输入来源标识"
              />
            </label>
            <label>
              漫画筛选
              <input
                value={comicFilter}
                onChange={(event) => setComicFilter(event.target.value)}
                placeholder="漫画 ID 或标题"
              />
            </label>
          </div>
          <label className="inline-toggle">
            <input
              checked={props.failedItemsOnly}
              onChange={(event) => props.onFailedItemsOnlyChange(event.target.checked)}
              type="checkbox"
            />{" "}
            下载明细只看失败项
          </label>
        </details>
      </div>
      {props.downloads.length > 0 && filteredDownloads.length === 0 && (
        <p className="muted">没有匹配当前筛选条件的下载任务。</p>
      )}
      {groupedDownloads.map((group) => (
        <div className="download-group" key={group.key}>
          <div className="section-heading">
            <h3>{group.title}</h3>
            <span className="count-badge">{group.tasks.length}</span>
          </div>
          {group.tasks.map((task) => (
            <DownloadTaskCard
              busy={props.taskOperations ? Boolean(props.taskOperations[task.id]) : props.busy}
              operation={props.taskOperations?.[task.id]}
              message={props.taskMessages?.[task.id]}
              itemError={props.itemErrors?.[task.id]}
              key={task.id}
              task={task}
              items={props.downloadItems[task.id]}
              failedItemsOnly={props.failedItemsOnly}
              onLoadDownloadItems={props.onLoadDownloadItems}
              onDownloadAction={props.onDownloadAction}
              onRetryDownloadItem={props.onRetryDownloadItem}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
