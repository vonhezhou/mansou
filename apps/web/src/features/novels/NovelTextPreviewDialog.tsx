import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../app/Icon.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { NovelCatalog, NovelOrigin } from "../../api/novels.js";

type Props = {
  origin: NovelOrigin;
  chapter: NovelCatalog["chapters"][number];
  index: number;
  start: number;
  end: number;
  content?: string;
  error?: string;
  loading: boolean;
  onMove: (direction: number) => void;
  onRetry: () => void;
  onClose: () => void;
};

export function NovelTextPreviewDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const trigger = useRef(document.activeElement);
  const titleId = useId();
  useLayoutEffect(() => {
    const value = dialog.current!;
    const previousFocus = trigger.current;
    value.showModal();
    return () => {
      value.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [props.chapter]);
  return createPortal(
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="preview-dialog novel-text-preview-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // 预览叠在详情上方，Esc 只关闭当前预览。
        event.preventDefault();
        event.stopPropagation();
        props.onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          props.onMove(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <header className="preview-dialog-header novel-text-preview-header">
        <div>
          <span className="novel-preview-eyebrow">正文预览 · {props.origin.sourceName}</span>
          <h2 id={titleId}>{props.chapter.title}</h2>
          <p className="muted">
            {props.origin.name} · 目录第 {props.index + 1} 项
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="关闭预览"
          title="关闭预览（Esc）"
          autoFocus
          onClick={props.onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div ref={viewport} className="novel-preview-content" aria-busy={props.loading}>
        {props.loading && (
          <div className="novel-preview-state">
            <LoadingStatus label="正在加载章节正文…" />
            <p className="muted">正在获取当前书源的正文</p>
          </div>
        )}
        {props.error && (
          <div className="novel-preview-state">
            <div className="alert" role="alert">
              <strong>正文暂时无法预览</strong>
              <p>{props.error}</p>
              <button
                className="secondary-button"
                onClick={() => {
                  dialog.current?.focus({ preventScroll: true });
                  props.onRetry();
                }}
              >
                重试正文
              </button>
            </div>
          </div>
        )}
        {props.content !== undefined && <article aria-label="章节正文">{props.content}</article>}
      </div>
      <footer className="preview-dialog-footer novel-text-preview-footer">
        <nav aria-label="正文预览翻章">
          <button
            className="secondary-button"
            disabled={props.index <= props.start}
            onClick={() => props.onMove(-1)}
          >
            <span className="novel-previous-icon">
              <Icon name="chevron" size={16} />
            </span>
            上一章
          </button>
          <span role="status" aria-live="polite">
            <strong>{props.index - props.start + 1}</strong> / {props.end - props.start}
            <small>
              预览第 {props.start + 1}–{props.end} 项
            </small>
          </span>
          <button
            className="secondary-button"
            disabled={props.index + 1 >= props.end}
            onClick={() => props.onMove(1)}
          >
            下一章
            <Icon name="chevron" size={16} />
          </button>
        </nav>
      </footer>
    </dialog>,
    document.body,
  );
}
