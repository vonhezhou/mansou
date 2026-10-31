import { useCallback, useEffect, useRef, useState } from "react";
import type { NovelBook, NovelCatalog, NovelOrigin, NovelSource } from "../../api/novels.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { AsyncImage } from "../../app/AsyncImage.js";
import { Icon } from "../../app/Icon.js";
import { NovelCatalogList } from "./NovelCatalogList.js";

type Props = {
  origin: NovelOrigin;
  book?: NovelBook;
  origins: NovelOrigin[];
  sources: NovelSource[];
  catalog?: NovelCatalog;
  error?: string;
  loading: boolean;
  downloading: boolean;
  downloadError?: string;
  onSelect: (origin: NovelOrigin) => void;
  onRefresh: () => void;
  onClose: () => void;
  onDownload: (all: boolean, start: number, limit: number) => void;
};

export function NovelDetailsDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [startText, setStartText] = useState("1");
  const [limitText, setLimitText] = useState("3");
  const [expandedIntro, setExpandedIntro] = useState(false);
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
  const catalog = props.catalog;
  const total = catalog?.chapters.length ?? 0;
  useEffect(() => {
    setStartText("1");
    setLimitText(String(Math.min(3, total || 3)));
  }, [props.origin, catalog, total]);
  useEffect(() => {
    setExpandedIntro(false);
  }, [props.origin]);
  const start = Number(startText),
    limit = Number(limitText);
  const startValid = startText !== "" && Number.isInteger(start) && start >= 1 && start <= total;
  const remaining = startValid ? total - start + 1 : total;
  const limitValid =
    limitText !== "" && Number.isInteger(limit) && limit >= 1 && limit <= remaining;
  const canDownload = Boolean(
    catalog?.tocComplete && total && startValid && limitValid && !props.downloading,
  );
  const chooseStart = useCallback(
    (index: number) => {
      setStartText(String(index));
      setLimitText((value) => String(Math.min(Math.max(1, Number(value) || 3), total - index + 1)));
    },
    [total],
  );
  const intro = props.book?.intro;
  const cover = props.origin.coverUrl ?? props.book?.coverUrl;
  return (
    <dialog
      ref={dialog}
      className="comic-dialog novel-detail-dialog"
      aria-label="小说详情"
      onCancel={props.onClose}
    >
      <header className="dialog-header novel-detail-header">
        <span>
          <Icon name="book-open" size={18} />
          书籍详情
        </span>
        <button
          className="icon-button"
          autoFocus
          aria-label="关闭详情"
          title="关闭详情（Esc）"
          onClick={props.onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="novel-detail-body">
        <section className="novel-book-overview" aria-label="书籍信息">
          <div className="novel-detail-cover">
            {cover ? <AsyncImage src={cover} alt="" /> : <Icon name="book-open" size={32} />}
          </div>
          <div className="novel-book-meta">
            <span className="eyebrow">{props.origin.sourceName}</span>
            <h2>{props.origin.name}</h2>
            <p>{props.origin.author || "作者未知"}</p>
            <div className="novel-book-stats">
              <span>{props.origins.length} 个来源</span>
              <span>
                {catalog
                  ? `${total.toLocaleString()} 项目录`
                  : props.loading
                    ? "目录加载中"
                    : "目录待加载"}
              </span>
              {props.book?.wordCount && <span>{props.book.wordCount}</span>}
            </div>
          </div>
        </section>
        {intro && (
          <div className="novel-book-intro">
            <p>{expandedIntro || intro.length <= 180 ? intro : `${intro.slice(0, 180)}…`}</p>
            {intro.length > 180 && (
              <button className="quiet-button" onClick={() => setExpandedIntro((value) => !value)}>
                {expandedIntro ? "收起简介" : "展开简介"}
              </button>
            )}
          </div>
        )}
        {props.origins.length > 1 && (
          <section className="novel-source-section" aria-label="书籍来源">
            <div className="novel-section-heading">
              <h3>选择来源</h3>
              <span className="muted">可切换书源重新获取目录</span>
            </div>
            <div className="novel-source-options" role="group" aria-label="选择小说来源">
              {props.origins.map((origin) => {
                const source = props.sources.find((source) => source.id === origin.sourceId);
                const selected =
                  origin.sourceId === props.origin.sourceId &&
                  origin.bookUrl === props.origin.bookUrl;
                return (
                  <button
                    key={`${origin.sourceId}:${origin.bookUrl}`}
                    className="secondary-button"
                    disabled={props.downloading || !source?.downloadSupported}
                    aria-pressed={selected}
                    title={source?.downloadError}
                    onClick={() => {
                      if (!selected) props.onSelect(origin);
                    }}
                  >
                    {selected && <Icon name="check" size={14} />}
                    {origin.sourceName}
                    {!source?.downloadSupported && <small>暂不支持下载</small>}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <section
          className="novel-directory-section"
          aria-label="小说目录"
          aria-busy={props.loading}
        >
          <div className="novel-section-heading">
            <h3>章节目录{catalog && <span>{total.toLocaleString()}</span>}</h3>
            <button
              className="quiet-button"
              disabled={props.loading || props.downloading}
              onClick={props.onRefresh}
            >
              刷新目录
            </button>
          </div>
          {props.loading && (
            <div className="novel-catalog-loading">
              <LoadingStatus label="正在加载所选书源目录…" />
              <p className="muted">
                {props.origins.length > 1
                  ? "可以切换其他来源，或关闭详情取消加载。"
                  : "关闭详情可取消加载，稍后仍可重试。"}
              </p>
              <div className="novel-catalog-skeleton" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {props.error && (
            <div className="alert novel-catalog-error" role="alert">
              <p>{props.error}</p>
              <button className="secondary-button" onClick={props.onRefresh}>
                重新加载目录
              </button>
            </div>
          )}
          {catalog && (
            <>
              {!catalog.tocComplete && (
                <p className="alert" role="status">
                  目录尚未遍历完，暂不能下载。
                  {props.origins.length > 1
                    ? "可刷新目录或切换书源。"
                    : "可刷新目录，或关闭后更换书源搜索。"}
                </p>
              )}
              <NovelCatalogList
                chapters={catalog.chapters}
                selected={startValid ? start : 0}
                disabled={props.downloading}
                onSelect={chooseStart}
              />
            </>
          )}
        </section>
      </div>
      <footer className="novel-detail-footer">
        {props.downloadError && (
          <p className="alert" role="alert">
            {props.downloadError}
          </p>
        )}
        <div className="novel-download-range">
          <label>
            起始目录项
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={total || undefined}
              value={startText}
              disabled={!catalog || props.downloading}
              onChange={(event) => {
                const value = event.target.value;
                setStartText(value);
                const index = Number(value);
                if (value && Number.isInteger(index) && index >= 1 && index <= total)
                  chooseStart(index);
              }}
            />
          </label>
          <label>
            下载项数
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={remaining || undefined}
              value={limitText}
              disabled={!catalog || props.downloading}
              onChange={(event) => setLimitText(event.target.value)}
            />
          </label>
          <div className="novel-range-summary" role="status">
            {props.downloading ? (
              <LoadingStatus label="正在创建下载任务…" />
            ) : !catalog ? (
              "目录加载后可选择范围"
            ) : !total ? (
              "暂无可下载目录项"
            ) : !startValid ? (
              `请输入 1–${total} 的起始项`
            ) : !limitValid ? (
              `下载项数应为 1–${remaining}`
            ) : (
              <>
                <strong>
                  第 {start}–{start + limit - 1} 项 · 共 {limit} 项
                </strong>
                <span>点击目录条目可设置起始项</span>
              </>
            )}
          </div>
        </div>
        <div className="novel-detail-download-actions">
          <button
            className="secondary-button"
            disabled={!catalog?.tocComplete || !total || props.downloading}
            onClick={() => props.onDownload(true, 1, 3)}
          >
            {catalog ? `下载全部 ${total.toLocaleString()} 项` : "下载全部章节"}
          </button>
          <button disabled={!canDownload} onClick={() => props.onDownload(false, start, limit)}>
            <Icon name="download" size={16} />
            下载所选范围
          </button>
        </div>
        <p className="novel-download-note">
          目录可能包含公告；目录完整不代表作品完结。下载任务在服务器继续执行。
        </p>
      </footer>
    </dialog>
  );
}
