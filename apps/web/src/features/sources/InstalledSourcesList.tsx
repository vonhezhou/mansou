import { useState } from "react";
import type { SourceMetadata } from "../../types.js";

import type { SourceOperation } from "./types.js";
import { SourceHealthStatus } from "./SourceHealthStatus.js";

type InstalledSourcesListProps = {
  busy: boolean;
  operation?: SourceOperation | null;
  sourceMetadata: SourceMetadata[];
  onConfigureSource: (key: string, mode: "settings" | "cookies") => void;
  onUninstallSource: (source: SourceMetadata) => void;
  onUpdateSource: (key: string) => void;
  onSetSourceFavorite: (source: SourceMetadata, favorite: boolean) => void;
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
};

export function InstalledSourcesList(props: InstalledSourcesListProps) {
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const sources = props.sourceMetadata
    .filter((source) => !favoritesOnly || source.favorite)
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
  return (
    <section className="installed-sources">
      <div className="section-heading">
        <h3>已安装源</h3>
        <span className="count-badge">{props.sourceMetadata.length}</span>
      </div>
      <label className="source-favorite-filter">
        <input
          type="checkbox"
          checked={favoritesOnly}
          onChange={(event) => setFavoritesOnly(event.target.checked)}
        />
        仅看收藏（{props.sourceMetadata.filter((source) => source.favorite).length}）
      </label>
      <p className="muted">收藏优先显示，更新和重载会保留收藏。</p>
      {sources.length > 0 ? (
        <div className="source-list installed-source-grid">
          {sources.map((source) => {
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
                  <span className="muted">{source.originalKey ?? source.key}</span>
                  {source.subscriptionName && (
                    <span className="muted">{source.subscriptionName}</span>
                  )}
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
                    onClick={() => props.onConfigureSource(source.key, "settings")}
                  >
                    源设置
                  </button>
                  <button
                    className="secondary-button"
                    disabled={props.busy}
                    onClick={() => props.onConfigureSource(source.key, "cookies")}
                  >
                    Cookie
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
                  <button
                    className="secondary-button"
                    aria-label={`${source.favorite ? "取消收藏" : "收藏"} ${source.name}`}
                    aria-pressed={!!source.favorite}
                    disabled={props.busy}
                    onClick={() => props.onSetSourceFavorite(source, !source.favorite)}
                  >
                    {source.favorite ? "★ 已收藏" : "☆ 收藏"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">{favoritesOnly ? "暂无收藏的漫画源。" : "暂无已安装源。"}</p>
      )}
    </section>
  );
}
