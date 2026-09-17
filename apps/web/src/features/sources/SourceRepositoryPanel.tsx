import type { RepositorySource } from "../../types.js";

type SourceRepositoryPanelProps = {
  busy: boolean;
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
      <div className="tool-row">
        <label>
          可安装源
          <select
            value={props.installSource}
            onChange={(event) => props.onInstallSourceChange(event.target.value)}
          >
            <option value="">选择源</option>
            {props.availableSources.map((source) => (
              <option
                key={source.key ?? source.fileName ?? source.name}
                value={source.key ?? source.fileName ?? source.name}
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
          安装/更新
        </button>
        <button onClick={props.onRefreshRepository} disabled={props.busy}>
          刷新仓库 / 检查更新
        </button>
        <button onClick={props.onReloadSources} disabled={props.busy}>
          重载已安装源
        </button>
      </div>
    </section>
  );
}
