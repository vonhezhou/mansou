import { useId, useMemo, useState } from "react";

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
  const filterId = useId();
  const [keyword, setKeyword] = useState("");
  const query = keyword.trim().toLowerCase();
  const filteredChapters = useMemo(
    () => chapters.filter(([, title]) => title.toLowerCase().includes(query)),
    [chapters, query],
  );
  const hiddenSelectedCount =
    props.selectedEpisodeIds.length - filteredChapters.filter(([id]) => selected.has(id)).length;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filteredChapters.length / chapterPageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleChapters = filteredChapters.slice(
    (currentPage - 1) * chapterPageSize,
    currentPage * chapterPageSize,
  );
  if (chapters.length === 0) return null;
  return (
    <>
      <div className="chapter-filter">
        <label htmlFor={filterId}>查找章节</label>
        <input
          id={filterId}
          type="search"
          placeholder="输入章节名称"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        {keyword && (
          <button
            className="secondary-button"
            onClick={() => {
              setKeyword("");
              setPage(1);
            }}
          >
            清除章节筛选
          </button>
        )}
      </div>
      {query && (
        <p className="muted" role="status">
          匹配 {filteredChapters.length} / {chapters.length} 章
          {hiddenSelectedCount > 0 && `，另有 ${hiddenSelectedCount} 章已选内容不在当前筛选中`}
        </p>
      )}
      <div className="selection-actions">
        <button onClick={() => props.onSelectEpisodes("all")}>
          {query ? "全选全部章节" : "全选"}
        </button>
        <button disabled={selected.size === 0} onClick={() => props.onSelectEpisodes("clear")}>
          清空
        </button>
        <button onClick={() => props.onSelectEpisodes("invert")}>
          {query ? "反选全部章节" : "反选"}
        </button>
        <span className="muted">已选 {props.selectedEpisodeIds.length} 章</span>
      </div>
      {filteredChapters.length === 0 && (
        <p className="muted">没有匹配的章节，请更换关键词或清除筛选。</p>
      )}
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
              aria-label={`预览 ${title}`}
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
