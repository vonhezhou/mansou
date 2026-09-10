import type { SettingsResponse, SourceMetadata } from "../../types.js";
import { CookieImportPanel } from "./CookieImportPanel.js";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";

type CurrentSourcePanelProps = {
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
  onSaveSourceSettings: () => void;
  onResetSourceSettings: () => void;
  onImportCookies: () => void;
  onClearCookies: () => void;
};

export function CurrentSourcePanel(props: CurrentSourcePanelProps) {
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
            value={props.sourceKey}
            onChange={(event) => props.onSourceChange(event.target.value)}
          >
            {props.sourceMetadata.map((source) => (
              <option key={source.key} value={source.key}>
                {source.name} ({source.key})
              </option>
            ))}
          </select>
        </label>
        <button onClick={props.onLoadSourceSettings} disabled={props.busy || !props.sourceKey}>
          加载设置
        </button>
      </div>
      <div className="current-source-sections">
        <SourceSettingsPanel
          busy={props.busy}
          sourceKey={props.sourceKey}
          sourceSettingsKey={props.sourceSettingsKey}
          sourceSettings={props.sourceSettings}
          settingsJson={props.settingsJson}
          onSettingsJsonChange={props.onSettingsJsonChange}
          onSaveSourceSettings={props.onSaveSourceSettings}
          onResetSourceSettings={props.onResetSourceSettings}
        />
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
    </section>
  );
}
