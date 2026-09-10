import type { Source } from "../../types.js";

type SearchControlsProps = {
  busy: boolean;
  sourceKey: string;
  sources: Source[];
  keyword: string;
  searchMode: "single" | "aggregate";
  aggregateSourceKeys: string[];
  onSourceChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onSearchModeChange: (value: "single" | "aggregate") => void;
  onSearch: () => void;
};

export function SearchControls(props: SearchControlsProps) {
  const canSearch =
    props.searchMode === "aggregate"
      ? props.aggregateSourceKeys.length > 0
      : Boolean(props.sourceKey);

  return (
    <section className="panel controls">
      <label>
        搜索模式
        <select
          value={props.searchMode}
          onChange={(event) =>
            props.onSearchModeChange(event.target.value as "single" | "aggregate")
          }
        >
          <option value="single">单源搜索</option>
          <option value="aggregate">聚合搜索</option>
        </select>
      </label>
      {props.searchMode === "single" && (
        <label>
          源
          <select
            value={props.sourceKey}
            onChange={(event) => props.onSourceChange(event.target.value)}
          >
            {props.sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.name} ({source.key})
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        关键词
        <input
          value={props.keyword}
          onChange={(event) => props.onKeywordChange(event.target.value)}
          placeholder="输入关键词"
        />
      </label>
      <button onClick={props.onSearch} disabled={props.busy || !canSearch}>
        搜索
      </button>
    </section>
  );
}
