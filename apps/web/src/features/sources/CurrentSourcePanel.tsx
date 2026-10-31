import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { SettingsResponse, SourceMetadata } from "../../types.js";
import { SourceAccountPanel } from "./SourceAccountPanel.js";
import { CookieImportPanel } from "./CookieImportPanel.js";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";

type CurrentSourcePanelProps = {
  mode: "settings" | "cookies";
  busy: boolean;
  sourceKey: string;
  sourceMetadata: SourceMetadata[];
  sourceSettings: SettingsResponse | null;
  sourceSettingsKey: string;
  settingsJson: string;
  cookieUrl: string;
  cookieText: string;
  onSettingsJsonChange: (value: string) => void;
  onCookieUrlChange: (value: string) => void;
  onCookieTextChange: (value: string) => void;
  onLoadSourceSettings: () => void;
  onEnableSource: (source: SourceMetadata) => void;
  onSaveSourceSettings: () => void;
  onResetSourceSettings: () => void;
  onImportCookies: () => void;
  onClearCookies: () => void;
};

export function CurrentSourcePanel(props: CurrentSourcePanelProps) {
  const current = props.sourceMetadata.find((source) => source.key === props.sourceKey);
  const enabled = current?.enabled === true || current?.enabled === 1;
  return (
    <section className="source-panel current-source-panel">
      <div className="source-operation-status">
        {props.busy && <LoadingStatus label="正在处理当前源设置…" />}
      </div>
      {!enabled ? (
        <div className="source-unavailable" role="status">
          <p>
            {current
              ? "此源已禁用，启用后即可管理设置、账号和 Cookie。"
              : "请选择一个已安装的漫画源。"}
          </p>
          {current && (
            <button disabled={props.busy} onClick={() => props.onEnableSource(current)}>
              启用此源
            </button>
          )}
        </div>
      ) : (
        <div className="current-source-sections">
          <div className="source-config-heading">
            <div>
              <span className="source-config-key">
                {current?.subscriptionName
                  ? `${current.subscriptionName} · ${current.originalKey ?? props.sourceKey}`
                  : props.sourceKey}
              </span>
              <p className="muted">
                {props.mode === "settings"
                  ? "配置仅对当前漫画源生效。"
                  : "Cookie 仅用于当前漫画源的请求。"}
              </p>
            </div>
            {props.mode === "settings" && (
              <button
                className="secondary-button"
                onClick={props.onLoadSourceSettings}
                disabled={props.busy}
              >
                {props.sourceSettingsKey === props.sourceKey && props.sourceSettings
                  ? "重新加载设置"
                  : "加载设置"}
              </button>
            )}
          </div>
          {props.mode !== "cookies" && (
            <>
              <SourceSettingsPanel
                key={`settings:${props.sourceKey}`}
                busy={props.busy}
                sourceKey={props.sourceKey}
                sourceSettingsKey={props.sourceSettingsKey}
                sourceSettings={props.sourceSettings}
                settingsJson={props.settingsJson}
                onSettingsJsonChange={props.onSettingsJsonChange}
                onSaveSourceSettings={props.onSaveSourceSettings}
                onResetSourceSettings={props.onResetSourceSettings}
              />
              {props.sourceKey && (
                <details className="source-config-disclosure">
                  <summary>账号与登录</summary>
                  <SourceAccountPanel
                    key={`account:${props.sourceKey}`}
                    sourceKey={props.sourceKey}
                  />
                </details>
              )}
            </>
          )}
          {props.mode !== "settings" && (
            <CookieImportPanel
              busy={props.busy}
              sourceKey={props.sourceKey}
              cookieUrl={props.cookieUrl}
              cookieText={props.cookieText}
              onCookieUrlChange={props.onCookieUrlChange}
              onCookieTextChange={props.onCookieTextChange}
              onImportCookies={props.onImportCookies}
              onClearCookies={props.onClearCookies}
            />
          )}
        </div>
      )}
    </section>
  );
}
