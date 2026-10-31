import { useLayoutEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon.js";

export function AppDialog({
  title,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = ref.current!;
    element.showModal();
    element
      .querySelector<HTMLElement>(
        "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      )
      ?.focus();
    // 在节点移除前关闭，让浏览器将焦点归还给打开弹窗的按钮。
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`app-dialog${wide ? " app-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="section-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={`关闭${title}`}
          title={`关闭${title}`}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
