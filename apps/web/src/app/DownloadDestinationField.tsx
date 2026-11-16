import { useEffect, useState } from "react";
import type { components } from "@mansou/contracts";
import { api } from "../api/client.js";

type Destination = components["schemas"]["DownloadDestination"];
export function DownloadDestinationField(props: {
  value?: Destination;
  onChange: (value: Destination) => void;
  disabled?: boolean;
}) {
  const [settings, setSettings] = useState<components["schemas"]["DownloadSettings"]>();
  const [error, setError] = useState("");
  const { onChange } = props;
  useEffect(() => {
    const controller = new AbortController();
    void api<components["schemas"]["DownloadSettings"]>("/settings/downloads", {
      signal: controller.signal,
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setSettings(value);
        onChange(value.defaultDestination);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [onChange]);
  const selected = props.value ?? settings?.defaultDestination;
  return (
    <div>
      <label>
        下载到
        <select
          value={selected ?? ""}
          onChange={(event) => props.onChange(event.target.value as Destination)}
          disabled={props.disabled || !settings}
        >
          {!settings && <option value="">加载目的地…</option>}
          <option value="public">公共</option>
          <option value="personal">个人</option>
        </select>
      </label>
      {settings && (
        <p className="muted">
          目标目录：{selected === "personal" ? settings.personalDir : settings.publicDir}
          。小说保存在其 novels 子目录。
        </p>
      )}
      {error && <p role="alert">目的地加载失败，{error}</p>}
    </div>
  );
}
