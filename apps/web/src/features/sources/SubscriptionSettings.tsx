import { useEffect, useRef, useState } from "react";
import { mansouApi } from "../../api/mansou.js";
import type { RepositorySource } from "../../types.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";

export function SubscriptionSettings({
  busy,
  onSaved,
}: {
  busy: boolean;
  onSaved: (sources: RepositorySource[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [cdnBaseUrl, setCdnBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    mansouApi
      .getSourceRepository()
      .then((repository) => {
        if (!active) return;
        setUrl(repository.url);
        setCdnBaseUrl(repository.cdnBaseUrl);
        setLoaded(true);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const disabled = busy || loading || saving || !loaded;
  async function save() {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const repository = await mansouApi.updateSourceRepository({
        url: url.trim(),
        cdnBaseUrl: cdnBaseUrl.trim(),
      });
      setUrl(repository.url);
      setCdnBaseUrl(repository.cdnBaseUrl);
      onSaved(repository.sources);
      setMessage("订阅已保存，可安装源列表已更新。");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="source-panel">
      <h3>漫画源订阅</h3>
      <p className="muted">配置提供漫画源列表的 JSON 地址。更换订阅不会卸载已安装源。</p>
      {loading && <LoadingStatus label="正在加载订阅配置…" />}
      {error && <p role="alert">{error}</p>}
      {!loaded && !loading && (
        <button onClick={() => setAttempt((value) => value + 1)}>重试加载订阅</button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="settings-grid">
          <label>
            订阅地址
            <input
              type="url"
              required
              pattern="https?://.*"
              disabled={disabled}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setMessage("");
              }}
              placeholder="https://example.com/index.json"
            />
          </label>
          <label>
            脚本下载地址（可选）
            <input
              type="url"
              pattern="https?://.*"
              disabled={disabled}
              value={cdnBaseUrl}
              onChange={(event) => {
                setCdnBaseUrl(event.target.value);
                setMessage("");
              }}
              placeholder="留空则相对于订阅地址下载"
            />
          </label>
        </div>
        <p className="muted">
          仅支持兼容 Venera 格式的订阅。保存时会验证并刷新列表；失败时保留原配置。脚本下载地址通常以
          / 结尾。
        </p>
        <button disabled={disabled || !url.trim()}>
          {saving ? "正在验证并保存…" : "保存订阅并刷新"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
