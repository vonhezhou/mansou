import { useMemo, useState } from "react";
import { groupDownloads } from "../../lib/downloads.js";
import { CachePanel } from "./CachePanel.js";
import { DownloadSummary } from "./DownloadSummary.js";
import { DownloadTaskCard } from "./DownloadTaskCard.js";
import type { DownloadsViewProps } from "./types.js";

export function DownloadsView(props: DownloadsViewProps) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [comicFilter, setComicFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const filteredDownloads = useMemo(
    () =>
      props.downloads.filter((task) => {
        const sourceMatched =
          !sourceFilter || task.sourceKey.toLowerCase().includes(sourceFilter.toLowerCase());
        const comicMatched =
          !comicFilter ||
          task.comicId.toLowerCase().includes(comicFilter.toLowerCase()) ||
          task.title?.toLowerCase().includes(comicFilter.toLowerCase());
        return sourceMatched && comicMatched;
      }),
    [props.downloads, sourceFilter, comicFilter],
  );
  const orderedDownloads = useMemo(
    () => groupDownloads(filteredDownloads).flatMap((group) => group.tasks),
    [filteredDownloads],
  );
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(orderedDownloads.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const groupedDownloads = groupDownloads(
    orderedDownloads.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  );

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
                onChange={(event) => {
                  setSourceFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="输入来源标识"
              />
            </label>
            <label>
              漫画筛选
              <input
                value={comicFilter}
                onChange={(event) => {
                  setComicFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="漫画 ID 或标题"
              />
            </label>
          </div>
          <label className="inline-toggle">
            <input
              disabled={props.busy}
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
      {pageCount > 1 && (
        <nav className="download-pagination" aria-label="下载任务分页">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            上一页任务
          </button>
          <select
            aria-label="下载任务页"
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
            下一页任务
          </button>
          <span>
            共 {orderedDownloads.length} 个匹配任务 · 每页 {pageSize} 个 · 分组数量为本页数量
          </span>
        </nav>
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
              itemPage={props.downloadItems[task.id]}
              showDetails={Boolean(expandedTasks[task.id])}
              onShowDetailsChange={(show) =>
                setExpandedTasks((current) => ({ ...current, [task.id]: show }))
              }
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
