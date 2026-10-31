import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { NovelCatalog } from "../../api/novels.js";
import { Icon } from "../../app/Icon.js";

const pageSize = 50;
export const NovelCatalogList = memo(function NovelCatalogList({
  chapters,
  selected,
  disabled,
  onSelect,
}: {
  chapters: NovelCatalog["chapters"];
  selected: number;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [page, setPage] = useState(1);
  const list = useRef<HTMLOListElement>(null);
  const indexed = useMemo(
    () =>
      chapters.map((chapter, index) => ({
        chapter,
        index: index + 1,
        text: chapter.title.toLowerCase(),
      })),
    [chapters],
  );
  const filtered = useMemo(() => {
    if (!deferredQuery) return indexed;
    if (/^\d+$/.test(deferredQuery)) {
      const item = indexed[Number(deferredQuery) - 1];
      return item ? [item] : [];
    }
    return indexed.filter((item) => item.text.includes(deferredQuery));
  }, [indexed, deferredQuery]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const offset = (current - 1) * pageSize;
  useEffect(() => {
    setPage(1);
    setQuery("");
  }, [chapters]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [current, deferredQuery]);
  return (
    <div className="novel-directory">
      <div className="novel-directory-tools">
        <label className="novel-chapter-search">
          <Icon name="search" size={17} />
          <input
            aria-label="搜索章节"
            placeholder="搜索章节名称或序号"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          className="secondary-button"
          disabled={disabled || selected < 1}
          onClick={() => {
            setQuery("");
            setPage(Math.floor((selected - 1) / pageSize) + 1);
          }}
        >
          定位起始项
        </button>
      </div>
      <p className="novel-directory-count muted" role="status">
        {query.trim().toLowerCase() !== deferredQuery
          ? "正在筛选…"
          : filtered.length
            ? `第 ${offset + 1}–${Math.min(offset + pageSize, filtered.length)} 项，共 ${filtered.length} 项${deferredQuery ? "匹配" : ""}`
            : "没有匹配的章节"}
      </p>
      <ol
        ref={list}
        className="novel-catalog"
        aria-label="目录条目"
        aria-busy={query.trim().toLowerCase() !== deferredQuery}
      >
        {filtered.slice(offset, offset + pageSize).map(({ chapter, index }) => (
          <li key={`${index}:${chapter.url}`}>
            <button
              className="novel-chapter"
              disabled={disabled}
              aria-pressed={selected === index}
              onClick={() => onSelect(index)}
              title={chapter.title}
            >
              <span className="novel-chapter-number">{index}.</span>
              <span>{chapter.title}</span>
              {selected === index && <Icon name="check" size={15} />}
            </button>
          </li>
        ))}
      </ol>
      <nav className="novel-directory-pagination" aria-label="目录分页">
        <button className="secondary-button" disabled={current === 1} onClick={() => setPage(1)}>
          首页
        </button>
        <button
          className="secondary-button"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          上一页
        </button>
        <span>
          {current} / {pages}
        </span>
        <button
          className="secondary-button"
          disabled={current === pages}
          onClick={() => setPage(current + 1)}
        >
          下一页
        </button>
        <button
          className="secondary-button"
          disabled={current === pages}
          onClick={() => setPage(pages)}
        >
          末页
        </button>
      </nav>
    </div>
  );
});
