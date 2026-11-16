import { useEffect, useState } from "react";
import type { components } from "@mansou/contracts";
import { api } from "../api/client.js";

type Settings = components["schemas"]["DownloadSettings"];
export function DownloadSettingsPanel() {
  const [settings, setSettings] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<Settings>("/settings/downloads", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setSettings(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, []);
  async function save() {
    if (!settings) return;
    setBusy(true);
    setStatus("");
    try {
      setSettings(
        await api<Settings>("/settings/downloads", {
          method: "PUT",
          body: JSON.stringify(settings),
        }),
      );
      setStatus("下载目的地已保存，新建任务时生效。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-panel">
      <h2>下载目的地</h2>
      {settings && (
        <>
          <label>
            公共目录
            <input
              value={settings.publicDir}
              disabled={busy}
              maxLength={4096}
              onChange={(event) => setSettings({ ...settings, publicDir: event.target.value })}
            />
          </label>
          <label>
            个人目录
            <input
              value={settings.personalDir}
              disabled={busy}
              maxLength={4096}
              onChange={(event) => setSettings({ ...settings, personalDir: event.target.value })}
            />
          </label>
          <label>
            默认目的地
            <select
              value={settings.defaultDestination}
              disabled={busy}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  defaultDestination: event.target.value as Settings["defaultDestination"],
                })
              }
            >
              <option value="public">公共</option>
              <option value="personal">个人</option>
            </select>
          </label>
          <p className="muted">
            填写容器内的绝对路径，公共与个人目录必须独立。小说保存在各目录的 novels
            子目录。已有任务沿用创建时的路径。
          </p>
        </>
      )}
      <button
        disabled={busy || !settings?.publicDir.trim() || !settings.personalDir.trim()}
        onClick={() => void save()}
      >
        {busy ? "保存中…" : "保存目的地"}
      </button>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
