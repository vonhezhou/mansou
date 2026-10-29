import { useMemo, useState } from "react";

const chapterPageSize = 100;

type ChapterSelectorProps = {
  chapters: Record<string, string>;
  episodeId: string | null;
  selectedEpisodeIds: string[];
  episodePageCounts: Record<string, number>;
  onPreviewEpisode: (episodeId?: string | null) => void;
  onToggleSelectedEpisode: (episodeId: string) => void;
  onSelectEpisodes: (action: "all" | "clear" | "invert") => void;
};

export function ChapterSelector(props: ChapterSelectorProps) {
  const chapters = useMemo(() => Object.entries(props.chapters), [props.chapters]);
  const selected = useMemo(() => new Set(props.selectedEpisodeIds), [props.selectedEpisodeIds]);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(chapters.length / chapterPageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleChapters = chapters.slice(
    (currentPage - 1) * chapterPageSize,
    currentPage * chapterPageSize,
  );
  return (
    <>
      <div className="selection-actions">
        <button onClick={() => props.onSelectEpisodes("all")}>全选</button>
        <button onClick={() => props.onSelectEpisodes("clear")}>清空</button>
        <button onClick={() => props.onSelectEpisodes("invert")}>反选</button>
        <span className="muted">已选 {props.selectedEpisodeIds.length} 章</span>
      </div>
      {pageCount > 1 && (
        <nav className="chapter-pagination" aria-label="章节分页">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            上一页章节
          </button>
          <select
            aria-label="章节页"
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
            下一页章节
          </button>
          <span className="chapter-page-summary">
            共 {pageCount} 页 · 每页 {chapterPageSize} 章，全选包含全部章节
          </span>
        </nav>
      )}
      <div className="chips">
        {visibleChapters.map(([id, title]) => (
          <span className="chapter-chip" key={id}>
            <label>
              <input
                checked={selected.has(id)}
                onChange={() => props.onToggleSelectedEpisode(id)}
                type="checkbox"
              />{" "}
              {title}
            </label>
            {props.episodePageCounts[id] !== undefined && (
              <small>{props.episodePageCounts[id]} 页</small>
            )}
            <button
              className={id === props.episodeId ? "active" : ""}
              onClick={() => props.onPreviewEpisode(id)}
            >
              预览
            </button>
          </span>
        ))}
      </div>
    </>
  );
}
