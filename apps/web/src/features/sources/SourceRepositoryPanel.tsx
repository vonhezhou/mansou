import type { RepositorySource } from "../../types.js";

import type { SourceOperation } from "./types.js";

type SourceRepositoryPanelProps = {
  busy: boolean;
  operation?: SourceOperation | null;
  installSource: string;
  availableSources: RepositorySource[];
  onInstallSourceChange: (value: string) => void;
  onInstallSelectedSource: () => void;
  onRefreshRepository: () => void;
  onReloadSources: () => void;
};

export function SourceRepositoryPanel(props: SourceRepositoryPanelProps) {
  return (
    <section className="source-panel">
      <h3>仓库 / 安装</h3>
      <p>仓库中有 {props.availableSources.length} 个可安装源，安装后即可用于搜索和下载。</p>
      <div className="tool-row">
        <label>
          可安装源
          <select
            disabled={props.busy}
            value={props.installSource}
            onChange={(event) => props.onInstallSourceChange(event.target.value)}
          >
            <option value="">选择源</option>
            {props.availableSources.map((source) => (
              <option
                key={source.filename ?? source.fileName ?? source.key ?? source.name}
                value={source.filename ?? source.fileName ?? source.key ?? source.name}
              >
                {source.name} ({source.key ?? source.fileName ?? source.filename})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={props.onInstallSelectedSource}
          disabled={props.busy || !props.installSource}
        >
          {props.operation?.kind === "install" ? "安装中…" : "安装/更新"}
        </button>
        <button onClick={props.onRefreshRepository} disabled={props.busy}>
          {props.operation?.kind === "repository" ? "检查更新中…" : "刷新仓库 / 检查更新"}
        </button>
        <button onClick={props.onReloadSources} disabled={props.busy}>
          {props.operation?.kind === "reload" ? "重载中…" : "重载已安装源"}
        </button>
      </div>
    </section>
  );
}
