import { LoadingStatus } from "../../app/LoadingStatus.js";
import { useEffect, useRef, useState } from "react";
import type { SettingsResponse } from "../../types.js";
import { veneraApi } from "../../api/venera.js";

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
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const title = `源设置：${props.sourceKey || "未选择"}`;
  if (!props.sourceSettings || props.sourceSettingsKey !== props.sourceKey)
    return (
      <section className="source-panel">
        <h3>{title}</h3>
        <p className="muted">选择当前操作源后点击“加载设置”。</p>
      </section>
    );
  let values: Record<string, unknown> = {};
  let invalidJson = false;
  try {
    const parsed = JSON.parse(props.settingsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalidJson = true;
    else values = parsed;
  } catch {
    invalidJson = true;
  }
  const busy = props.busy || actionBusy;
  function update(key: string, value: unknown) {
    props.onSettingsJsonChange(JSON.stringify({ ...values, [key]: value }, null, 2));
  }
  async function invoke(key: string) {
    setActionBusy(true);
    setError("");
    try {
      const settings = await veneraApi.invokeSourceSetting(props.sourceKey, key);
      if (active.current) props.onSettingsJsonChange(JSON.stringify(settings.values, null, 2));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  }
  return (
    <section className="source-panel">
      <h3>{title}</h3>
      {actionBusy && <LoadingStatus label="正在执行源设置操作…" />}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSaveSourceSettings();
        }}
      >
        <div className="settings-grid">
          {Object.entries(props.sourceSettings.schema).map(([key, field]) => {
            const value = values[key] ?? field.default;
            if (field.type === "callback")
              return (
                <div key={key}>
                  <span>{field.title ?? key}</span>
                  <button type="button" disabled={busy} onClick={() => void invoke(key)}>
                    {field.buttonText ?? "执行"}
                  </button>
                </div>
              );
            if (field.type === "switch")
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    disabled={busy || invalidJson}
                    checked={Boolean(value)}
                    onChange={(event) => update(key, event.target.checked)}
                  />
                  {field.title ?? key}
                </label>
              );
            if (field.type === "select") {
              const options = (field.options ?? []).map((option) =>
                typeof option === "string" ? { value: option, text: option } : option,
              );
              return (
                <label key={key}>
                  {field.title ?? key}
                  <select
                    disabled={busy || invalidJson}
                    value={JSON.stringify(value) ?? ""}
                    onChange={(event) => update(key, JSON.parse(event.target.value))}
                  >
                    <option value="" disabled>
                      请选择
                    </option>
                    {options.map((option, index) => (
                      <option key={index} value={JSON.stringify(option.value)}>
                        {option.text ?? String(option.value)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={key}>
                {field.title ?? key}
                <input
                  disabled={busy || invalidJson}
                  value={String(value ?? "")}
                  onChange={(event) => update(key, event.target.value)}
                />
              </label>
            );
          })}
        </div>
        {!Object.keys(props.sourceSettings.schema).length && (
          <p className="muted">此源没有可配置项。</p>
        )}
        <details>
          <summary>高级：编辑设置 JSON</summary>
          <label>
            源设置 JSON
            <textarea
              value={props.settingsJson}
              disabled={busy}
              onChange={(event) => props.onSettingsJsonChange(event.target.value)}
            />
          </label>
        </details>
        {invalidJson && <p role="alert">设置必须是有效的 JSON 对象。</p>}
        <div className="actions">
          <button disabled={busy || invalidJson}>保存设置</button>
          <button
            type="button"
            className="danger"
            onClick={props.onResetSourceSettings}
            disabled={busy}
          >
            恢复默认
          </button>
        </div>
      </form>
    </section>
  );
}
