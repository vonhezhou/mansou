import { CurrentSourcePanel } from "./CurrentSourcePanel.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";
import { SourceRepositoryPanel } from "./SourceRepositoryPanel.js";
import type { SourcesViewProps } from "./types.js";

export function SourcesView(props: SourcesViewProps) {
  const enabledSources = props.sourceMetadata.filter(
    (source) => source.enabled === true || source.enabled === 1,
  ).length;

  return (
    <section className="panel source-tools">
      <h2>源管理</h2>
      <p className="muted">
        已安装 {props.sourceMetadata.length} 个源，启用 {enabledSources} 个。
      </p>
      <SourceRepositoryPanel
        busy={props.busy}
        installSource={props.installSource}
        availableSources={props.availableSources}
        onInstallSourceChange={props.onInstallSourceChange}
        onInstallSelectedSource={props.onInstallSelectedSource}
        onRefreshRepository={props.onRefreshRepository}
        onReloadSources={props.onReloadSources}
      />
      <InstalledSourcesList
        busy={props.busy}
        sourceMetadata={props.sourceMetadata}
        onSetSourceEnabled={props.onSetSourceEnabled}
        onUpdateSource={props.onUpdateSource}
      />
      <CurrentSourcePanel
        busy={props.busy}
        sourceKey={props.sourceKey}
        sourceMetadata={props.sourceMetadata}
        sourceSettings={props.sourceSettings}
        sourceSettingsKey={props.sourceSettingsKey}
        settingsJson={props.settingsJson}
        cookieUrl={props.cookieUrl}
        cookieText={props.cookieText}
        onSourceChange={props.onSourceChange}
        onSettingsJsonChange={props.onSettingsJsonChange}
        onCookieUrlChange={props.onCookieUrlChange}
        onCookieTextChange={props.onCookieTextChange}
        onLoadSourceSettings={props.onLoadSourceSettings}
        onSaveSourceSettings={props.onSaveSourceSettings}
        onResetSourceSettings={props.onResetSourceSettings}
        onImportCookies={props.onImportCookies}
        onClearCookies={props.onClearCookies}
      />
    </section>
  );
}
