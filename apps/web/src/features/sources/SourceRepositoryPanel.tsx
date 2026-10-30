import { useState } from "react";
import type { RepositorySource, SourceMetadata } from "../../types.js";
import type { SourceOperation } from "./types.js";

type SourceRepositoryPanelProps = {
  busy: boolean;
  operation?: SourceOperation | null;
  availableSources: RepositorySource[];
  sourceMetadata: SourceMetadata[];
  onInstallSource: (source: string) => void;
  onRefreshRepository: () => void;
  onReloadSources: () => void;
};

export function SourceRepositoryPanel(props: SourceRepositoryPanelProps) {
  const [query, setQuery] = useState("");
  const [onlyUninstalled, setOnlyUninstalled] = useState(false);
  const installedKeys = new Set(props.sourceMetadata.map((source) => source.key));
  const sources = props.availableSources.filter((source) => {
    const matches = [
      source.name,
      source.key,
      source.description,
      source.filename,
      source.fileName,
    ].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()));
    return matches && (!onlyUninstalled || !source.key || !installedKeys.has(source.key));
  });
  return (
    <section className="source-panel repository-panel">
      <div className="repository-heading">
        <div>
          <h3>发现漫画源</h3>
          <p className="muted">
            仓库中有 {props.availableSources.length} 个可安装源，选择卡片即可安装。
          </p>
        </div>
        <div className="source-actions">
          <button
            className="secondary-button"
            onClick={props.onRefreshRepository}
            disabled={props.busy}
          >
            {props.operation?.kind === "repository" ? "检查更新中…" : "刷新仓库 / 检查更新"}
          </button>
          <button
            className="secondary-button"
            onClick={props.onReloadSources}
            disabled={props.busy}
          >
            {props.operation?.kind === "reload" ? "重载中…" : "重载已安装源"}
          </button>
        </div>
      </div>
      <div className="repository-filters">
        <label>
          搜索漫画源
          <input
            type="search"
            placeholder="搜索名称、简介或标识"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="repository-uninstalled-filter">
          <input
            type="checkbox"
            checked={onlyUninstalled}
            onChange={(event) => setOnlyUninstalled(event.target.checked)}
          />
          仅显示未安装
        </label>
        <span className="muted">显示 {sources.length} 个</span>
      </div>
      <div className="repository-source-grid">
        {sources.map((source) => {
          const identifier = source.filename ?? source.fileName ?? source.key ?? source.name;
          const installed = !!source.key && installedKeys.has(source.key);
          const installing =
            props.operation?.kind === "install" && props.operation.sourceKey === identifier;
          return (
            <article key={identifier} className="repository-source-card" aria-busy={installing}>
              <div className="repository-card-heading">
                <span className="source-avatar" aria-hidden="true">
                  {source.name.slice(0, 1)}
                </span>
                <div className="source-info">
                  <strong>{source.name}</strong>
                  <span className="muted">{source.key ?? identifier}</span>
                </div>
                {installed && <span className="source-enabled">已安装</span>}
              </div>
              <p className="repository-description">{source.description || "仓库暂未提供简介。"}</p>
              <span className="repository-filename muted">
                {source.filename ?? source.fileName ?? ""}
              </span>
              <div className="repository-card-footer">
                <span className="muted">版本 {source.version ?? "未提供"}</span>
                <button disabled={props.busy} onClick={() => props.onInstallSource(identifier)}>
                  {installing ? "安装中…" : installed ? "重新安装" : "安装"}
                </button>
              </div>
              <span className="repository-card-status" role="status">
                {installing ? props.operation?.label : ""}
              </span>
            </article>
          );
        })}
      </div>
      {sources.length === 0 && (
        <p className="muted">
          {props.availableSources.length
            ? "没有符合条件的漫画源，请调整搜索或筛选条件。"
            : "仓库暂无漫画源，请刷新仓库。"}
        </p>
      )}
    </section>
  );
}
