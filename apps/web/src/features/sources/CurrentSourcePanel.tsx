import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { Ref } from "react";
import type { SettingsResponse, SourceMetadata } from "../../types.js";
import { SourceAccountPanel } from "./SourceAccountPanel.js";
import { CookieImportPanel } from "./CookieImportPanel.js";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";

type CurrentSourcePanelProps = {
  selectRef?: Ref<HTMLSelectElement>;
  busy: boolean;
  sourceKey: string;
  sourceMetadata: SourceMetadata[];
  sourceSettings: SettingsResponse | null;
  sourceSettingsKey: string;
  settingsJson: string;
  cookieUrl: string;
  cookieText: string;
  onSourceChange: (value: string) => void;
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
      <div className="current-source-header">
        <div>
          <h3>当前操作源</h3>
          <p className="muted">源设置和 Cookie 都只作用于这里选择的源。</p>
        </div>
        <label>
          源
          <select
            ref={props.selectRef}
            disabled={props.busy}
            value={props.sourceKey}
            onChange={(event) => props.onSourceChange(event.target.value)}
          >
            {!current && <option value="">选择漫画源</option>}
            {props.sourceMetadata.map((source) => (
              <option key={source.key} value={source.key}>
                {source.name} ({source.key})
              </option>
            ))}
          </select>
        </label>
        <button onClick={props.onLoadSourceSettings} disabled={props.busy || !enabled}>
          {props.sourceSettingsKey === props.sourceKey && props.sourceSettings
            ? "重新加载设置"
            : "加载设置"}
        </button>
      </div>
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
            <SourceAccountPanel key={`account:${props.sourceKey}`} sourceKey={props.sourceKey} />
          )}
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
        </div>
      )}
    </section>
  );
}
