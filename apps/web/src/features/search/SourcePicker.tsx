import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { Source } from "../../types.js";

type SourcePickerProps = {
  sources: Source[];
  searchMode: "single" | "aggregate";
  sourceKey: string;
  aggregateSourceKeys: string[];
  busy: boolean;
  onSourceChange: (value: string) => void;
  onToggleAggregateSource: (value: string) => void;
  onSelectAggregateSources: (action: "all" | "invert") => void;
};

export function SourcePicker(props: SourcePickerProps) {
  const sources = props.sources.filter((source) => source.hasSearch);
  const aggregate = props.searchMode === "aggregate";
  return (
    <fieldset className="source-picker" disabled={props.busy}>
      <legend>
        漫画源 <span className="muted">{aggregate ? "可多选" : "单选"}</span>
      </legend>
      {aggregate && sources.length > 0 && (
        <div className="source-selection-actions" role="group" aria-label="快速选择漫画源">
          <button
            type="button"
            className="secondary-button"
            onClick={() => props.onSelectAggregateSources("all")}
          >
            全选
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => props.onSelectAggregateSources("invert")}
          >
            反选
          </button>
        </div>
      )}
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
      {sources.length === 0 && props.busy ? (
        <LoadingStatus label="正在加载漫画源…" />
      ) : sources.length === 0 ? (
        <p className="muted">
          暂无可搜索的漫画源，<a href="#sources">前往源管理安装或启用</a>。
        </p>
      ) : aggregate && props.aggregateSourceKeys.length === 0 ? (
        <p className="muted">请选择至少一个漫画源。</p>
      ) : null}
    </fieldset>
  );
}
