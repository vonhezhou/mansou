import { useState } from "react";
import { api } from "../api/client.js";
import { DownloadDirectoryField } from "./DownloadDirectoryField.js";

export function DownloadSettingsPanel() {
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const settings = await api<{ downloadDir: string }>("/settings/downloads", {
        method: "PUT",
        body: JSON.stringify({ downloadDir: directory.trim() }),
      });
      setDirectory(settings.downloadDir);
      setStatus("默认下载目录已保存，新建任务时生效。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-panel">
      <h2>默认下载目录</h2>
      <DownloadDirectoryField value={directory} onChange={setDirectory} disabled={busy} />
      <button disabled={busy || !directory.trim()} onClick={() => void save()}>
        {busy ? "保存中…" : "保存目录"}
      </button>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
