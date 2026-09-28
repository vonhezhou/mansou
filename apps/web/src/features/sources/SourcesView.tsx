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
      <h1>源管理</h1>
      <p className="muted">
        已安装 {props.sourceMetadata.length} 个源，启用 {enabledSources} 个。
      </p>
      <details className="disclosure">
        <summary>
          <span className="summary-icon" aria-hidden="true">
            ＋
          </span>
          <span>
            安装新源<small>从仓库添加更多漫画来源</small>
          </span>
        </summary>
        <SourceRepositoryPanel
          busy={props.busy}
          installSource={props.installSource}
          availableSources={props.availableSources}
          onInstallSourceChange={props.onInstallSourceChange}
          onInstallSelectedSource={props.onInstallSelectedSource}
          onRefreshRepository={props.onRefreshRepository}
          onReloadSources={props.onReloadSources}
        />
      </details>
      <InstalledSourcesList
        busy={props.busy}
        sourceMetadata={props.sourceMetadata}
        onSetSourceEnabled={props.onSetSourceEnabled}
        onUpdateSource={props.onUpdateSource}
      />
      <details className="disclosure">
        <summary>
          <span className="summary-icon" aria-hidden="true">
            ⚙
          </span>
          <span>
            源设置与 Cookie<small>管理单个源的连接和访问配置</small>
          </span>
        </summary>
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
      </details>
    </section>
  );
}
