import type { Source } from "../../types.js";

type AggregateSourcePickerProps = {
  sources: Source[];
  aggregateSourceKeys: string[];
  onToggleAggregateSource: (value: string) => void;
};

export function AggregateSourcePicker(props: AggregateSourcePickerProps) {
  return (
    <details className="panel source-picker">
      <summary>
        参与聚合搜索的源 <span className="muted">已选 {props.aggregateSourceKeys.length} 个</span>
      </summary>
      <div className="check-list">
        {props.sources
          .filter((source) => source.hasSearch)
          .map((source) => (
            <label key={source.key}>
              <input
                checked={props.aggregateSourceKeys.includes(source.key)}
                onChange={() => props.onToggleAggregateSource(source.key)}
                type="checkbox"
              />{" "}
              {source.name} <span className="muted">({source.key})</span>
            </label>
          ))}
      </div>
      {props.aggregateSourceKeys.length === 0 && (
        <p className="muted">请选择至少一个源，避免默认搜索全部源。</p>
      )}
    </details>
  );
}
