import { useEffect, useRef } from "react";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { Icon } from "../../app/Icon.js";
import type { Source } from "../../types.js";

type SearchControlsProps = {
  busy: boolean;
  sourceKey: string;
  sources: Source[];
  keyword: string;
  searchMode: "single" | "aggregate";
  aggregateSourceKeys: string[];
  onKeywordChange: (value: string) => void;
  onSearchModeChange: (value: "single" | "aggregate") => void;
  onSearch: () => void;
};

export function SearchControls(props: SearchControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canSearch =
    props.searchMode === "aggregate"
      ? props.aggregateSourceKeys.length > 0
      : props.sources.some((source) => source.key === props.sourceKey && source.hasSearch);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <>
      <span className="eyebrow">
        <Icon name="sparkles" size={15} /> DISCOVER
      </span>
      <h1>今天想看点什么？</h1>
      <p className="hero-description">跨越多个漫画源，一次搜索即可找到你想看的内容。</p>
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.busy && canSearch && props.keyword.trim()) props.onSearch();
        }}
      >
        <Icon name="search" size={22} />
        <input
          ref={inputRef}
          aria-label="搜索关键词"
          value={props.keyword}
          onChange={(event) => props.onKeywordChange(event.target.value)}
          placeholder="搜索漫画名称或关键词…"
        />
        <kbd className="keycap">⌘ / Ctrl K</kbd>
        <button type="submit" disabled={props.busy || !canSearch || !props.keyword.trim()}>
          {props.busy ? <LoadingStatus label="处理中…" /> : "搜索"}
        </button>
      </form>
      <div className="search-mode-row">
        <span>搜索方式</span>
        <div className="segmented-control" role="group" aria-label="搜索模式">
          {(["single", "aggregate"] as const).map((mode) => (
            <button
              key={mode}
              disabled={props.busy}
              className={props.searchMode === mode ? "active" : ""}
              aria-pressed={props.searchMode === mode}
              onClick={() => props.onSearchModeChange(mode)}
            >
              {mode === "single" ? "单源搜索" : "聚合搜索"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
