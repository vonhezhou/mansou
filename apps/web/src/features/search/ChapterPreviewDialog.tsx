import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AsyncImage } from "../../app/AsyncImage.js";
import { Icon } from "../../app/Icon.js";

type ChapterPreviewDialogProps = {
  images: string[];
  totalPages: number;
  chapterTitle?: string;
  activePage: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
};

export function ChapterPreviewDialog(props: ChapterPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef(document.activeElement);
  const titleId = useId();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = triggerRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);

  function movePage(direction: number) {
    const page = props.activePage + direction;
    if (page >= 0 && page < props.images.length) props.onPageChange(page);
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="preview-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // React 的 Portal 事件仍向详情冒泡，Esc 只关闭最上层的图片预览。
        event.preventDefault();
        event.stopPropagation();
        props.onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          movePage(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <header className="preview-dialog-header">
        <div>
          <h2 id={titleId}>{props.chapterTitle ?? "章节图片预览"}</h2>
          <p className="muted">
            预览前 {props.images.length} 页 · 本章共 {props.totalPages} 页
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭预览"
          title="关闭预览"
          autoFocus
          onClick={props.onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div
        key={props.activePage}
        className="preview-dialog-image"
        onTouchStart={(event) => {
          touchStart.current =
            event.touches.length === 1
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
              : null;
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) touchStart.current = null;
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || event.touches.length || event.changedTouches.length !== 1) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          // 保留长图纵向滚动和浏览器双指缩放，只识别明显的横向滑动。
          if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) movePage(dx < 0 ? 1 : -1);
        }}
      >
        <AsyncImage
          src={props.images[props.activePage]}
          alt={`第 ${props.activePage + 1} 页`}
          loading="eager"
          retryable
          animate
        />
      </div>
      <footer className="preview-dialog-footer">
        <button
          type="button"
          className="secondary-button"
          disabled={props.activePage === 0}
          onClick={() => movePage(-1)}
        >
          上一页
        </button>
        <span role="status" aria-live="polite">
          第 {props.activePage + 1} / {props.images.length} 页
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={props.activePage === props.images.length - 1}
          onClick={() => movePage(1)}
        >
          下一页
        </button>
        <p className="muted">左右滑动或使用方向键切换；完整内容请下载后阅读。</p>
      </footer>
    </dialog>,
    document.body,
  );
}
