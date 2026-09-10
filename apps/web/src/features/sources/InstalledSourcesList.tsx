import type { SourceMetadata } from "../../types.js";

type InstalledSourcesListProps = {
  busy: boolean;
  sourceMetadata: SourceMetadata[];
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
};

export function InstalledSourcesList(props: InstalledSourcesListProps) {
  return (
    <section className="source-panel">
      <h3>已安装源</h3>
      {props.sourceMetadata.length > 0 ? (
        <div className="source-list">
          {props.sourceMetadata.map((source) => {
            const enabled = source.enabled === true || source.enabled === 1;
            return (
              <article key={source.key}>
                <div>
                  <strong>{source.name}</strong>
                  <span className="muted">
                    {source.key}
                    {source.version ? ` / ${source.version}` : ""}
                  </span>
                </div>
                <span className={enabled ? "status-badge online" : "status-badge"}>
                  {enabled ? "已启用" : "已禁用"}
                </span>
                <button
                  onClick={() => props.onSetSourceEnabled(source, !enabled)}
                  disabled={props.busy}
                >
                  {enabled ? "禁用" : "启用"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">暂无已安装源。</p>
      )}
    </section>
  );
}
