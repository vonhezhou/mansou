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
    <section className="panel downloads">
      <h2>服务器下载中心</h2>
      <p className="muted download-destination-note">
        这里管理保存到 NAS 的下载任务。任务在服务器后台运行，关闭浏览器也不会中断；完成后可将 CBZ
        下载到本机。
      </p>
      <DownloadSummary downloads={props.downloads} />
      <CachePanel
        cache={props.cache}
        onPruneCache={props.onPruneCache}
        onClearCache={props.onClearCache}
      />
      {props.downloads.length === 0 && <p className="muted">暂无下载任务。</p>}
      <div className="download-filters">
        <label>
          来源筛选
          <input
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            placeholder="sourceKey"
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
      {props.downloads.length > 0 && filteredDownloads.length === 0 && (
        <p className="muted">没有匹配当前筛选条件的下载任务。</p>
      )}
      {groupedDownloads.map((group) => (
        <div className="download-group" key={group.key}>
          <h3>{group.title}</h3>
          {group.tasks.map((task) => (
            <DownloadTaskCard
              busy={props.busy}
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
