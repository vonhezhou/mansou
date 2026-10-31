import type { SourceMetadata } from "../../types.js";

import type { SourceOperation } from "./types.js";
import { SourceHealthStatus } from "./SourceHealthStatus.js";

type InstalledSourcesListProps = {
  busy: boolean;
  operation?: SourceOperation | null;
  sourceMetadata: SourceMetadata[];
  onConfigureSource: (key: string) => void;
  onUninstallSource: (source: SourceMetadata) => void;
  onUpdateSource: (key: string) => void;
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
};

export function InstalledSourcesList(props: InstalledSourcesListProps) {
  return (
    <section className="installed-sources">
      <div className="section-heading">
        <h3>已安装源</h3>
        <span className="count-badge">{props.sourceMetadata.length}</span>
      </div>
      {props.sourceMetadata.length > 0 ? (
        <div className="source-list installed-source-grid">
          {props.sourceMetadata.map((source) => {
            const enabled = source.enabled === true || source.enabled === 1;
            const pending = props.operation?.sourceKey === source.key ? props.operation : null;
            const switching = pending?.kind === "enable" || pending?.kind === "disable";
            return (
              <article key={source.key} aria-busy={!!pending}>
                <span className="source-avatar" aria-hidden="true">
                  {source.name.slice(0, 1)}
                </span>
                <div className="source-info">
                  <strong>{source.name}</strong>
                  <span className="muted">{source.key}</span>
                </div>
                <button
                  className="source-switch"
                  role="switch"
                  aria-checked={enabled}
                  aria-busy={switching}
                  aria-label={`${enabled ? "禁用" : "启用"} ${source.name}`}
                  onClick={() => props.onSetSourceEnabled(source, !enabled)}
                  disabled={props.busy}
                >
                  <span className={switching ? "loading-spinner" : undefined} />
                </button>
                <div className="source-card-meta">
                  <span>
                    版本 <b>{source.version ?? "未提供"}</b>
                  </span>
                  <span role="status" className={enabled ? "source-enabled" : "muted"}>
                    {pending
                      ? pending.kind === "enable"
                        ? "启用中…"
                        : pending.kind === "disable"
                          ? "禁用中…"
                          : pending.kind === "uninstall"
                            ? "卸载中…"
                            : "更新中…"
                      : enabled
                        ? "已启用"
                        : "已禁用"}
                  </span>
                </div>
                <SourceHealthStatus health={source.health} />
                <div className="source-actions">
                  {source.availableVersion && (
                    <button disabled={props.busy} onClick={() => props.onUpdateSource(source.key)}>
                      {pending?.kind === "update" ? "更新中…" : `更新至 ${source.availableVersion}`}
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    disabled={props.busy}
                    onClick={() => props.onConfigureSource(source.key)}
                  >
                    配置
                  </button>
                  {source.canUninstall === false ? (
                    <span className="muted">内置源，仅可禁用</span>
                  ) : (
                    <button
                      className="danger-subtle"
                      disabled={props.busy}
                      onClick={() => props.onUninstallSource(source)}
                    >
                      {pending?.kind === "uninstall" ? "卸载中…" : "卸载"}
                    </button>
                  )}
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
