import { useEffect, useState } from "react";
import { api } from "../api/client.js";

export function DownloadDirectoryField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [directory, setDirectory] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<{ downloadDir: string }>("/settings/downloads", { signal: controller.signal })
      .then((settings) => setDirectory(settings.downloadDir))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, []);
  return (
    <div>
      <label>
        下载目录
        <input
          value={props.value}
          placeholder={directory || "使用服务器默认下载目录"}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
          maxLength={4096}
        />
      </label>
      <p className="muted">
        填写服务器上的绝对路径，留空使用默认目录。小说保存在其 novels 子目录。
      </p>
      {error && <p role="alert">默认目录加载失败，{error}</p>}
    </div>
  );
}
