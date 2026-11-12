import { useEffect, useRef, useState } from "react";
import { novelApi, type NovelCatalog, type NovelOrigin } from "../../api/novels.js";
import { Icon } from "../../app/Icon.js";
import { NovelTextPreviewDialog } from "./NovelTextPreviewDialog.js";

type Selection = { start: number; end: number; index: number };

export function NovelChapterPreview({
  origin,
  catalog,
  selected,
}: {
  origin: NovelOrigin;
  catalog: NovelCatalog;
  selected: number;
}) {
  const [countText, setCountText] = useState("3");
  const [selection, setSelection] = useState<Selection>();
  const [content, setContent] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const total = catalog.chapters.length;
  const count = Number(countText);
  const countValid = countText !== "" && Number.isInteger(count) && count >= 1 && count <= 50000;
  const chapter = selection ? catalog.chapters[selection.index] : undefined;
  useEffect(() => {
    if (!chapter) return;
    const controller = new AbortController();
    request.current = controller;
    setContent(undefined);
    setError(undefined);
    setLoading(true);
    void novelApi
      .preview(origin, chapter.url, controller.signal)
      .then(
        (value) => {
          if (!controller.signal.aborted) setContent(value.content);
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setError(error instanceof Error ? error.message : String(error));
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [origin, chapter, attempt]);
  const open = (value?: Selection) => {
    request.current?.abort();
    setContent(undefined);
    setError(undefined);
    setLoading(Boolean(value));
    setSelection(value);
    setAttempt((value) => value + 1);
  };
  return (
    <section className="novel-preview-section" aria-label="正文预览">
      <div className="novel-preview-heading">
        <span className="novel-preview-symbol">
          <Icon name="book-open" size={18} />
        </span>
        <div>
          <h3>先看看正文</h3>
          <p>确认书籍，抽查更新质量</p>
        </div>
      </div>
      <div className="novel-preview-tools">
        <button
          className="secondary-button novel-preview-selected"
          disabled={selected < 1 || selected > total}
          onClick={() => open({ start: 0, end: total, index: selected - 1 })}
        >
          预览所选章节
        </button>
        <div className="novel-preview-sampling">
          <label>
            章数
            <input
              aria-label="抽查章数 N"
              type="number"
              min={1}
              max={50000}
              value={countText}
              onChange={(event) => setCountText(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!total || !countValid}
            onClick={() => open({ start: 0, end: Math.min(count, total), index: 0 })}
          >
            开头 N 章
          </button>
          <button
            className="secondary-button"
            disabled={!total || !countValid || !catalog.tocComplete}
            onClick={() =>
              open({
                start: Math.max(0, total - count),
                end: total,
                index: Math.max(0, total - count),
              })
            }
          >
            最新 N 章
          </button>
        </div>
      </div>
      <p className="muted novel-preview-note">
        {catalog.tocComplete
          ? "支持任意章节预览；最新章节按当前书源目录末尾计算。"
          : "支持已知章节预览；目录未完整，暂不能定位最新章节。"}
      </p>
      {selection && chapter && (
        <NovelTextPreviewDialog
          origin={origin}
          chapter={chapter}
          {...selection}
          content={content}
          error={error}
          loading={loading}
          onMove={(direction) => {
            const index = selection.index + direction;
            if (index >= selection.start && index < selection.end) open({ ...selection, index });
          }}
          onRetry={() => open({ ...selection })}
          onClose={() => open()}
        />
      )}
    </section>
  );
}
