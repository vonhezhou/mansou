import { useLayoutEffect, useRef, useState } from "react";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import { Icon } from "../../app/Icon.js";
import { CurrentSourcePanel } from "./CurrentSourcePanel.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";
import { SourceRepositoryPanel } from "./SourceRepositoryPanel.js";
import type { SourcesViewProps } from "./types.js";

export function SourcesView(props: SourcesViewProps) {
  const [repositoryLoaded, setRepositoryLoaded] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const sourceSelectRef = useRef<HTMLSelectElement>(null);
  const repositoryRef = useRef<HTMLDetailsElement>(null);
  const focusTarget = useRef<"repository" | "settings" | null>(null);
  useLayoutEffect(() => {
    if (props.busy) return;
    if (focusTarget.current === "repository") {
      repositoryRef.current?.querySelector("input")?.focus({ preventScroll: true });
    } else if (focusTarget.current === "settings") {
      sourceSelectRef.current?.focus({ preventScroll: true });
    }
    focusTarget.current = null;
  }, [repositoryLoaded, settingsLoaded, props.busy]);
  const enabledSources = props.sourceMetadata.filter(
    (source) => source.enabled === true || source.enabled === 1,
  ).length;

  function configureSource(key: string) {
    props.onSourceChange(key);
    const source = props.sourceMetadata.find((source) => source.key === key);
    if (source?.enabled === true || source?.enabled === 1) props.onLoadSourceSettings(key);
  }

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
              focusTarget.current = repositoryLoaded ? null : "repository";
              setRepositoryLoaded(true);
              repositoryRef.current.open = true;
              repositoryRef.current.querySelector("input")?.focus({ preventScroll: true });
              repositoryRef.current.scrollIntoView({ block: "nearest" });
            }
          }}
        >
          <Icon name="plus" size={17} />
          安装漫画源
        </button>
      </header>
      <div className="source-operation-status">
        {props.operation && !props.operation.sourceKey && (
          <LoadingStatus label={props.operation.label} />
        )}
      </div>
      <details
        className="disclosure"
        ref={repositoryRef}
        onToggle={(event) => {
          if (event.currentTarget.open) setRepositoryLoaded(true);
        }}
      >
        <summary>
          <span className="summary-icon" aria-hidden="true">
            <Icon name="plus" />
          </span>
          <span>
            安装新源<small>从仓库添加更多漫画来源</small>
          </span>
        </summary>
        {repositoryLoaded && (
          <SourceRepositoryPanel
            busy={props.busy}
            operation={props.operation}
            availableSources={props.availableSources}
            sourceMetadata={props.sourceMetadata}
            onInstallSource={props.onInstallSource}
            onRefreshRepository={props.onRefreshRepository}
            onReloadSources={props.onReloadSources}
          />
        )}
      </details>
      {props.metadataRefreshError && (
        <p className="muted" role="status">
          近期状态更新失败，以下为上次获取的记录，稍后将自动重试。
        </p>
      )}
      <InstalledSourcesList
        busy={props.busy}
        operation={props.operation}
        sourceMetadata={props.sourceMetadata}
        onSetSourceEnabled={props.onSetSourceEnabled}
        onUpdateSource={props.onUpdateSource}
        onUninstallSource={props.onUninstallSource}
        onConfigureSource={(key) => {
          configureSource(key);
          if (settingsRef.current) {
            focusTarget.current = settingsLoaded ? null : "settings";
            setSettingsLoaded(true);
            settingsRef.current.open = true;
            sourceSelectRef.current?.focus({ preventScroll: true });
            settingsRef.current.scrollIntoView({ block: "start" });
          }
        }}
      />
      <details
        className="disclosure"
        ref={settingsRef}
        onToggle={(event) => {
          if (event.currentTarget.open) setSettingsLoaded(true);
        }}
      >
        <summary>
          <span className="summary-icon" aria-hidden="true">
            <Icon name="settings" />
          </span>
          <span>
            源设置与 Cookie<small>管理单个源的连接和访问配置</small>
          </span>
        </summary>
        {settingsLoaded && (
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
            onSourceChange={configureSource}
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
        )}
      </details>
    </section>
  );
}
