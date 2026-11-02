import { useEffect, useRef, useState } from "react";
import { novelApi, type NovelCatalog, type NovelOrigin } from "../../api/novels.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";

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
  const trigger = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
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
    if (viewport.current) viewport.current.scrollTop = 0;
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "nearest" });
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
      <div className="novel-section-heading">
        <h3>正文预览</h3>
      </div>
      <div className="novel-preview-tools">
        <button
          ref={trigger}
          className="secondary-button"
          disabled={selected < 1 || selected > total}
          onClick={() => open({ start: 0, end: total, index: selected - 1 })}
        >
          预览所选章节
        </button>
        <label>
          抽查章数 N
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
      <p className="muted novel-preview-note">
        选择目录中的任意章节后，点击“预览所选章节”；开头用于确认书籍，最新用于抽查尾部正文。
        {catalog.tocComplete
          ? "最新按当前书源目录末尾计算。"
          : "目录尚未完整，暂不能定位最新章节。"}
      </p>
      {selection && chapter && (
        <div className="novel-preview-pane">
          <div className="novel-section-heading">
            <h4 ref={heading} tabIndex={-1}>
              {chapter.title}
            </h4>
            <button
              className="quiet-button"
              onClick={() => {
                open();
                trigger.current?.focus();
              }}
            >
              关闭预览
            </button>
          </div>
          <p className="muted novel-preview-note">
            {origin.sourceName} · 第 {selection.index + 1} 项 · 本次预览范围 {selection.start + 1}–
            {selection.end} 项
          </p>
          <div ref={viewport} className="novel-preview-content" aria-busy={loading}>
            {loading && <LoadingStatus label="正在加载章节正文…" />}
            {error && (
              <div className="alert" role="alert">
                <p>{error}</p>
                <button className="secondary-button" onClick={() => open({ ...selection })}>
                  重试正文
                </button>
              </div>
            )}
            {content !== undefined && <article aria-label="章节正文">{content}</article>}
          </div>
          <nav className="novel-preview-navigation" aria-label="正文预览翻章">
            <button
              className="secondary-button"
              disabled={selection.index <= selection.start}
              onClick={() => open({ ...selection, index: selection.index - 1 })}
            >
              上一章
            </button>
            <button
              className="secondary-button"
              disabled={selection.index + 1 >= selection.end}
              onClick={() => open({ ...selection, index: selection.index + 1 })}
            >
              下一章
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
