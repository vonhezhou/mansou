import type { SettingsResponse } from "../../types.js";

type SourceSettingsPanelProps = {
  busy: boolean;
  sourceKey: string;
  sourceSettingsKey: string;
  sourceSettings: SettingsResponse | null;
  settingsJson: string;
  onSettingsJsonChange: (value: string) => void;
  onSaveSourceSettings: () => void;
  onResetSourceSettings: () => void;
};

export function SourceSettingsPanel(props: SourceSettingsPanelProps) {
  const title = `源设置：${props.sourceKey || "未选择"}`;
  if (!props.sourceSettings || props.sourceSettingsKey !== props.sourceKey)
    return (
      <section className="source-panel">
        <h3>{title}</h3>
        <p className="muted">选择当前操作源后点击“加载设置”。</p>
      </section>
    );

  return (
    <section className="source-panel">
      <h3>{title}</h3>
      <div className="settings-grid">
        <label>
          源设置 JSON
          <textarea
            value={props.settingsJson}
            onChange={(event) => props.onSettingsJsonChange(event.target.value)}
          />
        </label>
        <div>
          <p className="muted">
            配置项：{Object.keys(props.sourceSettings.schema ?? {}).join(", ") || "无"}
          </p>
          <div className="actions">
            <button onClick={props.onSaveSourceSettings} disabled={props.busy}>
              保存设置
            </button>
            <button className="danger" onClick={props.onResetSourceSettings} disabled={props.busy}>
              恢复默认
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
