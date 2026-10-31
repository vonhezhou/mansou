import { useId, useState } from "react";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { AppDialog } from "../../app/AppDialog.js";
import { PageTabs } from "../../app/PageTabs.js";
import { Icon } from "../../app/Icon.js";
import { CurrentSourcePanel } from "./CurrentSourcePanel.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";
import { SubscriptionSettings } from "./SubscriptionSettings.js";
import { SourceRepositoryPanel } from "./SourceRepositoryPanel.js";
import type { SourcesViewProps } from "./types.js";

const managementTabs = [
  { key: "installed", label: "已安装源" },
  { key: "subscriptions", label: "订阅管理" },
] as const;

export function SourcesView(props: SourcesViewProps) {
  const [activeView, setActiveView] = useState<"installed" | "subscriptions">("installed");
  const tabId = useId();
  const [repositoryOpen, setRepositoryOpen] = useState(false);
  const [sourceDialog, setSourceDialog] = useState<"settings" | "cookies" | null>(null);
  const enabledSources = props.sourceMetadata.filter(
    (source) => source.enabled === true || source.enabled === 1,
  ).length;

  return (
    <section className="inner-page source-tools">
      <header className="page-title">
        <div>
          <span className="eyebrow">SOURCE LIBRARY</span>
          <h1>漫画源</h1>
          <p>
            {activeView === "installed"
              ? `已安装 ${props.sourceMetadata.length} 个漫画源，启用 ${enabledSources} 个。`
              : "管理提供漫画源列表的订阅。"}
          </p>
        </div>
        {activeView === "installed" && (
          <button className="button-with-icon" onClick={() => setRepositoryOpen(true)}>
            <Icon name="plus" size={17} />
            安装漫画源
          </button>
        )}
      </header>
      <PageTabs
        id={tabId}
        label="漫画源管理"
        tabs={managementTabs}
        value={activeView}
        onChange={setActiveView}
      />
      {props.operation && !props.operation.sourceKey && (
        <div className="source-operation-status">
          <LoadingStatus label={props.operation.label} />
        </div>
      )}
      {repositoryOpen && (
        <AppDialog title="安装漫画源" wide onClose={() => setRepositoryOpen(false)}>
          {props.error && (
            <p className="alert" role="alert">
              {props.error}
            </p>
          )}
          <SourceRepositoryPanel
            busy={props.busy}
            operation={props.operation}
            availableSources={props.availableSources}
            sourceMetadata={props.sourceMetadata}
            onInstallSource={props.onInstallSource}
            onRefreshRepository={props.onRefreshRepository}
            onReloadSources={props.onReloadSources}
          />
        </AppDialog>
      )}
      {props.metadataRefreshError && (
        <p className="muted" role="status">
          近期状态更新失败，以下为上次获取的记录，稍后将自动重试。
        </p>
      )}
      <div
        role="tabpanel"
        id={`${tabId}-subscriptions-panel`}
        aria-labelledby={`${tabId}-subscriptions-tab`}
        hidden={activeView !== "subscriptions"}
      >
        {activeView === "subscriptions" && (
          <SubscriptionSettings busy={props.busy} onSaved={props.onRepositorySaved} />
        )}
      </div>
      <div
        role="tabpanel"
        id={`${tabId}-installed-panel`}
        aria-labelledby={`${tabId}-installed-tab`}
        hidden={activeView !== "installed"}
      >
        {activeView === "installed" && (
          <InstalledSourcesList
            busy={props.busy}
            operation={props.operation}
            sourceMetadata={props.sourceMetadata}
            onSetSourceFavorite={props.onSetSourceFavorite}
            onSetSourceEnabled={props.onSetSourceEnabled}
            onUpdateSource={props.onUpdateSource}
            onUninstallSource={props.onUninstallSource}
            onConfigureSource={(key, mode) => {
              if (key !== props.sourceKey) props.onSourceChange(key);
              const source = props.sourceMetadata.find((source) => source.key === key);
              if (mode === "settings" && (source?.enabled === true || source?.enabled === 1)) {
                props.onLoadSourceSettings(key);
              }
              setSourceDialog(mode);
            }}
          />
        )}
      </div>
      {sourceDialog && (
        <AppDialog
          title={`${props.sourceMetadata.find((source) => source.key === props.sourceKey)?.name ?? props.sourceKey} · ${sourceDialog === "settings" ? "源设置与账号" : "Cookie"}`}
          onClose={() => setSourceDialog(null)}
        >
          {props.error && (
            <p className="alert" role="alert">
              {props.error}
            </p>
          )}
          <CurrentSourcePanel
            mode={sourceDialog}
            busy={props.busy}
            sourceKey={props.sourceKey}
            sourceMetadata={props.sourceMetadata}
            sourceSettings={props.sourceSettings}
            sourceSettingsKey={props.sourceSettingsKey}
            settingsJson={props.settingsJson}
            cookieUrl={props.cookieUrl}
            cookieText={props.cookieText}
            onSettingsJsonChange={props.onSettingsJsonChange}
            onCookieUrlChange={props.onCookieUrlChange}
            onCookieTextChange={props.onCookieTextChange}
            onLoadSourceSettings={() => props.onLoadSourceSettings(props.sourceKey)}
            onEnableSource={(source) => props.onSetSourceEnabled(source, true)}
            onSaveSourceSettings={props.onSaveSourceSettings}
            onResetSourceSettings={props.onResetSourceSettings}
            onImportCookies={props.onImportCookies}
            onClearCookies={props.onClearCookies}
          />
        </AppDialog>
      )}
    </section>
  );
}
