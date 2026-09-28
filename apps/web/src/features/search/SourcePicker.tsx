import type { Source } from "../../types.js";

type SourcePickerProps = {
  sources: Source[];
  searchMode: "single" | "aggregate";
  sourceKey: string;
  aggregateSourceKeys: string[];
  busy: boolean;
  onSourceChange: (value: string) => void;
  onToggleAggregateSource: (value: string) => void;
};

export function SourcePicker(props: SourcePickerProps) {
  const sources = props.sources.filter((source) => source.hasSearch);
  const aggregate = props.searchMode === "aggregate";
  return (
    <fieldset className="source-picker" disabled={props.busy}>
      <legend>
        漫画源 <span className="muted">{aggregate ? "可多选" : "单选"}</span>
      </legend>
      <div className="source-pills">
        {sources.map((source) => {
          const selected = aggregate
            ? props.aggregateSourceKeys.includes(source.key)
            : props.sourceKey === source.key;
          return (
            <label className="source-pill" key={source.key}>
              <input
                type={aggregate ? "checkbox" : "radio"}
                name={aggregate ? undefined : "search-source"}
                value={source.key}
                checked={selected}
                onChange={() =>
                  aggregate
                    ? props.onToggleAggregateSource(source.key)
                    : props.onSourceChange(source.key)
                }
              />
              <span className="pill-indicator" aria-hidden="true">
                {selected ? "✓" : "+"}
              </span>
              <span>{source.name}</span>
            </label>
          );
        })}
      </div>
      {sources.length === 0 ? (
        <p className="muted">暂无可搜索的漫画源，请在源管理中安装或启用。</p>
      ) : aggregate && props.aggregateSourceKeys.length === 0 ? (
        <p className="muted">请选择至少一个漫画源。</p>
      ) : null}
    </fieldset>
  );
}
