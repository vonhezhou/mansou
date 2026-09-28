import type { SourceMetadata } from "../../types.js";

type InstalledSourcesListProps = {
  busy: boolean;
  sourceMetadata: SourceMetadata[];
  onUpdateSource: (key: string) => void;
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
};

export function InstalledSourcesList(props: InstalledSourcesListProps) {
  return (
    <section className="source-panel">
      <div className="section-heading">
        <h3>已安装源</h3>
        <span className="count-badge">{props.sourceMetadata.length}</span>
      </div>
      {props.sourceMetadata.length > 0 ? (
        <div className="source-list">
          {props.sourceMetadata.map((source) => {
            const enabled = source.enabled === true || source.enabled === 1;
            return (
              <article key={source.key}>
                <span className="source-avatar" aria-hidden="true">
                  {source.name.slice(0, 1)}
                </span>
                <div className="source-info">
                  <strong>{source.name}</strong>
                  <span className="muted">
                    {source.key}
                    {source.version ? ` / ${source.version}` : ""}
                  </span>
                </div>
                <span className={enabled ? "status-badge online" : "status-badge"}>
                  {enabled ? "已启用" : "已禁用"}
                </span>
                <div className="source-actions">
                  {source.availableVersion && (
                    <button disabled={props.busy} onClick={() => props.onUpdateSource(source.key)}>
                      更新至 {source.availableVersion}
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    onClick={() => props.onSetSourceEnabled(source, !enabled)}
                    disabled={props.busy}
                  >
                    {enabled ? "禁用" : "启用"}
                  </button>
                </div>
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
