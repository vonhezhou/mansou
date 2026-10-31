import { useEffect, useRef, useState } from "react";
import type { NovelCatalog, NovelOrigin, NovelSource } from "../../api/novels.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";

type Props = {
  origin: NovelOrigin;
  origins: NovelOrigin[];
  sources: NovelSource[];
  catalog?: NovelCatalog;
  error?: string;
  busy: boolean;
  onSelect: (origin: NovelOrigin) => void;
  onClose: () => void;
  onDownload: (all: boolean, start: number, limit: number) => void;
};

export function NovelDetailsDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(1);
  const [limit, setLimit] = useState(3);
  useEffect(() => {
    const value = dialog.current!;
    value.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      value.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    setStart(1);
    setLimit(3);
  }, [props.origin]);
  const catalog = props.catalog;
  return (
    <dialog
      ref={dialog}
      className="comic-dialog novel-detail-dialog"
      aria-label="小说详情"
      aria-busy={props.busy}
      onCancel={props.onClose}
    >
      <div className="dialog-header">
        <span>小说详情</span>
        <button className="secondary-button" autoFocus onClick={props.onClose}>
          关闭目录
        </button>
      </div>
      <div className="novel-detail-heading">
        <h2>{props.origin.name}</h2>
        <p className="muted">
          {props.origin.author || "作者未知"} · {props.origin.sourceName}
        </p>
        <div className="novel-actions" role="group" aria-label="选择小说来源">
          {props.origins.map((origin) => {
            const source = props.sources.find((source) => source.id === origin.sourceId);
            return (
              <button
                key={`${origin.sourceId}:${origin.bookUrl}`}
                className="secondary-button"
                disabled={props.busy || !source?.downloadSupported}
                aria-pressed={
                  origin.sourceId === props.origin.sourceId &&
                  origin.bookUrl === props.origin.bookUrl
                }
                title={source?.downloadError}
                onClick={() => props.onSelect(origin)}
              >
                {origin.sourceName}
                {source?.downloadSupported ? " · 目录与下载" : " · 暂不支持下载"}
              </button>
            );
          })}
        </div>
      </div>
      <section aria-label="小说目录">
        {props.busy && !catalog && <LoadingStatus label="正在加载所选书源目录…" />}
        {props.error && (
          <p className="alert" role="alert">
            {props.error}
          </p>
        )}
        {!catalog && !props.busy && (
          <button onClick={() => props.onSelect(props.origin)}>重新加载目录</button>
        )}
        {catalog && (
          <>
            <p>
              共 {catalog.chapters.length} 项 · 已解析 {catalog.tocPages} 页 ·{" "}
              {catalog.tocComplete ? "目录遍历完成" : "目录尚未遍历完，暂不能下载"}
            </p>
            <p className="muted">
              章节保留站点原始顺序，可能含公告。请先检查顺序和范围；这里不判断作品是否完结。
            </p>
            <fieldset className="detail-content" disabled={props.busy}>
              <div className="novel-inline">
                <label>
                  起始目录项
                  <input
                    type="number"
                    min={1}
                    max={catalog.chapters.length}
                    value={start}
                    onChange={(event) => setStart(Number(event.target.value))}
                  />
                </label>
                <label>
                  下载项数
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                  />
                </label>
                <button
                  disabled={
                    !catalog.tocComplete ||
                    !Number.isInteger(start) ||
                    start < 1 ||
                    start > catalog.chapters.length ||
                    !Number.isInteger(limit) ||
                    limit < 1 ||
                    limit > 50000
                  }
                  onClick={() => props.onDownload(false, start, limit)}
                >
                  下载所选范围
                </button>
                <button
                  disabled={!catalog.tocComplete}
                  onClick={() => props.onDownload(true, 1, 3)}
                >
                  下载目录全部章节
                </button>
              </div>
              <ol className="novel-catalog">
                {catalog.chapters.slice(0, 200).map((chapter, index) => (
                  <li key={chapter.url}>
                    {index + 1}. {chapter.title}
                  </li>
                ))}
              </ol>
              {catalog.chapters.length > 200 && (
                <p className="muted">仅展示前 200 项，下载包含所选范围内全部章节。</p>
              )}
            </fieldset>
          </>
        )}
      </section>
    </dialog>
  );
}
