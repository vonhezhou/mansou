import { useEffect, useId, useRef } from "react";
import type { SourceUiEvent } from "../../types.js";

type Props = {
  dialog: Extract<SourceUiEvent, { type: "dialog" }>;
  onChoose: (buttonIndex: number | null) => void;
};

export function SourceActionDialog({ dialog, onChoose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    return () => {
      element.close();
    };
  }, [dialog.id]);
  return (
    <dialog
      ref={ref}
      className="source-action-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onChoose(null);
      }}
    >
      <header className="section-heading">
        <h2 id={titleId}>{dialog.title}</h2>
        <button
          type="button"
          className="quiet-button"
          aria-label="关闭源操作对话框"
          autoFocus
          onClick={() => onChoose(null)}
        >
          关闭
        </button>
      </header>
      <p>{dialog.message}</p>
      <div className="actions">
        {dialog.buttons.map((label, index) => (
          <button
            key={index}
            type="button"
            className={index === dialog.buttons.length - 1 ? undefined : "secondary-button"}
            onClick={() => onChoose(index)}
          >
            {label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
