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
  const canSearch =
    props.searchMode === "aggregate"
      ? props.aggregateSourceKeys.length > 0
      : props.sources.some((source) => source.key === props.sourceKey && source.hasSearch);

  return (
    <form
      className="controls"
      onSubmit={(event) => {
        event.preventDefault();
        if (!props.busy && canSearch) props.onSearch();
      }}
    >
      <h1>搜索</h1>
      <input
        aria-label="搜索关键词"
        value={props.keyword}
        onChange={(event) => props.onKeywordChange(event.target.value)}
        placeholder="搜索漫画名称…"
      />
      <select
        aria-label="搜索模式"
        value={props.searchMode}
        onChange={(event) => props.onSearchModeChange(event.target.value as "single" | "aggregate")}
      >
        <option value="single">单源搜索</option>
        <option value="aggregate">聚合搜索</option>
      </select>
      <button type="submit" disabled={props.busy || !canSearch}>
        {props.busy ? "处理中…" : "搜索"}
      </button>
    </form>
  );
}
