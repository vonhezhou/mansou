import type { RepositorySource, SettingsResponse, SourceMetadata } from "../types.js";

type SourcesViewProps = {
  busy: boolean;
  sourceKey: string;
  installSource: string;
  availableSources: RepositorySource[];
  sourceMetadata: SourceMetadata[];
  sourceSettings: SettingsResponse | null;
  settingsJson: string;
  cookieUrl: string;
  cookieText: string;
  onInstallSourceChange: (value: string) => void;
  onSettingsJsonChange: (value: string) => void;
  onCookieUrlChange: (value: string) => void;
  onCookieTextChange: (value: string) => void;
  onInstallSelectedSource: () => void;
  onRefreshRepository: () => void;
  onReloadSources: () => void;
  onLoadSourceSettings: () => void;
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
  onSaveSourceSettings: () => void;
  onResetSourceSettings: () => void;
  onImportCookies: () => void;
  onClearCookies: () => void;
};

export function SourcesView(props: SourcesViewProps) {
  const enabledSources = props.sourceMetadata.filter((source) => source.enabled === true || source.enabled === 1).length;

  return <section className="panel source-tools">
    <h2>源管理</h2>
    <p className="muted">已安装 {props.sourceMetadata.length} 个源，启用 {enabledSources} 个。</p>
    <div className="tool-row">
      <label>可安装源<select value={props.installSource} onChange={(event) => props.onInstallSourceChange(event.target.value)}><option value="">选择源</option>{props.availableSources.map((source) => <option key={source.key ?? source.fileName ?? source.name} value={source.key ?? source.fileName ?? source.name}>{source.name} ({source.key ?? source.fileName ?? source.filename})</option>)}</select></label>
      <button onClick={props.onInstallSelectedSource} disabled={props.busy || !props.installSource}>安装/更新</button>
      <button onClick={props.onRefreshRepository} disabled={props.busy}>刷新仓库</button>
      <button onClick={props.onReloadSources} disabled={props.busy}>重载已安装源</button>
      <button onClick={props.onLoadSourceSettings} disabled={props.busy || !props.sourceKey}>加载设置</button>
    </div>
    {props.sourceMetadata.length > 0 && <div className="source-list">{props.sourceMetadata.map((source) => <article key={source.key}><div><strong>{source.name}</strong><span className="muted">{source.key}{source.version ? ` / ${source.version}` : ""}</span></div><button onClick={() => props.onSetSourceEnabled(source, !(source.enabled === true || source.enabled === 1))} disabled={props.busy}>{source.enabled === true || source.enabled === 1 ? "禁用" : "启用"}</button></article>)}</div>}
    {props.sourceSettings && <div className="settings-grid"><label>源设置 JSON<textarea value={props.settingsJson} onChange={(event) => props.onSettingsJsonChange(event.target.value)} /></label><div><p className="muted">配置项：{Object.keys(props.sourceSettings.schema ?? {}).join(", ") || "无"}</p><div className="actions"><button onClick={props.onSaveSourceSettings} disabled={props.busy}>保存设置</button><button onClick={props.onResetSourceSettings} disabled={props.busy}>恢复默认</button></div></div></div>}
    <div className="settings-grid"><label>Cookie URL<input value={props.cookieUrl} onChange={(event) => props.onCookieUrlChange(event.target.value)} placeholder="https://example.com" /></label><label>Cookie 每行一条<textarea value={props.cookieText} onChange={(event) => props.onCookieTextChange(event.target.value)} placeholder="name=value; Domain=..." /></label><div className="actions"><button onClick={props.onImportCookies} disabled={props.busy || !props.cookieUrl || !props.cookieText}>导入 Cookie</button><button onClick={props.onClearCookies} disabled={props.busy || !props.sourceKey}>清空 Cookie</button></div></div>
  </section>;
}
