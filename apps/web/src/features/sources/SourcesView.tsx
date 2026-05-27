import { CookieImportPanel } from "./CookieImportPanel.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";
import { SourceRepositoryPanel } from "./SourceRepositoryPanel.js";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";
import type { SourcesViewProps } from "./types.js";

export function SourcesView(props: SourcesViewProps) {
  const enabledSources = props.sourceMetadata.filter((source) => source.enabled === true || source.enabled === 1).length;

  return <section className="panel source-tools">
    <h2>源管理</h2>
    <p className="muted">已安装 {props.sourceMetadata.length} 个源，启用 {enabledSources} 个。</p>
    <SourceRepositoryPanel busy={props.busy} sourceKey={props.sourceKey} installSource={props.installSource} availableSources={props.availableSources} onInstallSourceChange={props.onInstallSourceChange} onInstallSelectedSource={props.onInstallSelectedSource} onRefreshRepository={props.onRefreshRepository} onReloadSources={props.onReloadSources} onLoadSourceSettings={props.onLoadSourceSettings} />
    <div className="source-management-grid">
      <InstalledSourcesList busy={props.busy} sourceMetadata={props.sourceMetadata} onSetSourceEnabled={props.onSetSourceEnabled} />
      <SourceSettingsPanel busy={props.busy} sourceSettings={props.sourceSettings} settingsJson={props.settingsJson} onSettingsJsonChange={props.onSettingsJsonChange} onSaveSourceSettings={props.onSaveSourceSettings} onResetSourceSettings={props.onResetSourceSettings} />
    </div>
    <CookieImportPanel busy={props.busy} sourceKey={props.sourceKey} cookieUrl={props.cookieUrl} cookieText={props.cookieText} onCookieUrlChange={props.onCookieUrlChange} onCookieTextChange={props.onCookieTextChange} onImportCookies={props.onImportCookies} onClearCookies={props.onClearCookies} />
  </section>;
}
