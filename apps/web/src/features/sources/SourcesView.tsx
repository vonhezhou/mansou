import { useRef } from "react";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { Icon } from "../../app/Icon.js";
import { CurrentSourcePanel } from "./CurrentSourcePanel.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";
import { SourceRepositoryPanel } from "./SourceRepositoryPanel.js";
import type { SourcesViewProps } from "./types.js";

export function SourcesView(props: SourcesViewProps) {
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const sourceSelectRef = useRef<HTMLSelectElement>(null);
  const repositoryRef = useRef<HTMLDetailsElement>(null);
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
            安装、启用并配置你的内容来源。已安装 {props.sourceMetadata.length} 个，启用{" "}
            {enabledSources} 个。
          </p>
        </div>
        <button
          className="button-with-icon"
          onClick={() => {
            if (repositoryRef.current) {
              repositoryRef.current.open = true;
              repositoryRef.current.scrollIntoView({ block: "nearest" });
              repositoryRef.current.querySelector("select")?.focus();
            }
          }}
        >
          <Icon name="plus" size={17} />
          安装漫画源
        </button>
      </header>
      {props.operation && <LoadingStatus label={props.operation.label} />}
      <details className="disclosure" ref={repositoryRef}>
        <summary>
          <span className="summary-icon" aria-hidden="true">
            <Icon name="plus" />
          </span>
          <span>
            安装新源<small>从仓库添加更多漫画来源</small>
          </span>
        </summary>
        <SourceRepositoryPanel
          busy={props.busy}
          operation={props.operation}
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
        operation={props.operation}
        sourceMetadata={props.sourceMetadata}
        onSetSourceEnabled={props.onSetSourceEnabled}
        onUpdateSource={props.onUpdateSource}
        onConfigureSource={(key) => {
          props.onSourceChange(key);
          if (settingsRef.current) {
            settingsRef.current.open = true;
            settingsRef.current.scrollIntoView({ block: "start" });
            sourceSelectRef.current?.focus({ preventScroll: true });
          }
        }}
      />
      <details className="disclosure" ref={settingsRef}>
        <summary>
          <span className="summary-icon" aria-hidden="true">
            <Icon name="settings" />
          </span>
          <span>
            源设置与 Cookie<small>管理单个源的连接和访问配置</small>
          </span>
        </summary>
        <CurrentSourcePanel
          selectRef={sourceSelectRef}
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
