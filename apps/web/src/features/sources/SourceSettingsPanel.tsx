import { useEffect, useRef } from "react";
import { mergeSettingsDraft } from "./settingsDraft.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { SettingsResponse } from "../../types.js";
import { useSourceActions } from "./useSourceActions.js";
import { SourceActionDialog } from "./SourceActionDialog.js";

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
  const savedValues = useRef(props.sourceSettings?.values ?? {});
  useEffect(() => {
    savedValues.current = props.sourceSettings?.values ?? {};
  }, [props.sourceSettings]);
  const actions = useSourceActions(props.sourceKey, (result) => {
    props.onSettingsJsonChange(
      mergeSettingsDraft(savedValues.current, props.settingsJson, result.values),
    );
    savedValues.current = result.values;
  });
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
  const busy = props.busy || actions.busy || !!actions.dialog;
  function update(key: string, value: unknown) {
    props.onSettingsJsonChange(JSON.stringify({ ...values, [key]: value }, null, 2));
  }
  return (
    <section className="source-panel">
      <h3>{title}</h3>
      <div className="source-operation-status">
        {actions.busy && <LoadingStatus label="正在执行源设置操作…" />}
      </div>
      {actions.error && <p role="alert">{actions.error}</p>}
      {actions.messages.map((message, index) => (
        <p className="source-action-message" key={index} role="status">
          {message}
        </p>
      ))}
      {actions.dialog && (
        <SourceActionDialog
          dialog={actions.dialog}
          onChoose={(index) => void actions.respond(index)}
        />
      )}
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
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(event) => void actions.invoke(key, event.currentTarget)}
                  >
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
