import { useEffect, useRef, useState, type FormEvent } from "react";
import type { components } from "@mansou/contracts";
import { mansouApi } from "../../api/mansou.js";
import type { RepositorySource } from "../../types.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";

type Repository = components["schemas"]["SourceRepository"];
type Subscription = components["schemas"]["SourceSubscription"];
export function SubscriptionSettings({
  busy,
  onSaved,
}: {
  busy: boolean;
  onSaved: (sources: RepositorySource[]) => void;
}) {
  const [repository, setRepository] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cdnBaseUrl, setCdnBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const submitting = useRef(false);
  const disabled = busy || loading || !!operation;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    mansouApi
      .getSourceRepository()
      .then((value) => {
        if (active) setRepository(value);
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
  function openForm(subscription?: Subscription) {
    setEditing(subscription?.id ?? null);
    setName(subscription?.name ?? "");
    setUrl(subscription?.url ?? "");
    setCdnBaseUrl(subscription?.cdnBaseUrl ?? "");
    setEnabled(subscription?.enabled ?? true);
    setFormOpen(true);
    setError("");
    setMessage("");
  }
  async function perform(label: string, action: () => Promise<Repository>) {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setOperation(label);
    setError("");
    setMessage("");
    try {
      const result = await action();
      setRepository(result);
      onSaved(result.sources);
      setFormOpen(false);
      setMessage(`${label}完成，可安装源列表已更新。`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      submitting.current = false;
      setOperation("");
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const settings = { name: name.trim(), url: url.trim(), cdnBaseUrl: cdnBaseUrl.trim(), enabled };
    void perform("保存订阅", () =>
      editing
        ? mansouApi.updateSourceRepository(editing, settings)
        : mansouApi.createSourceRepository(settings),
    );
  }
  return (
    <section className="source-panel subscription-settings">
      <p className="muted">
        可添加多个订阅。相同漫画源在不同订阅下独立安装，账号与设置互不影响。移除订阅不会卸载已安装源。
      </p>
      {loading && <LoadingStatus label="正在加载订阅配置…" />}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!repository && !loading && (
        <button onClick={() => setAttempt((value) => value + 1)}>重试加载订阅</button>
      )}
      <div className="subscription-list">
        {repository?.subscriptions.map((subscription) => (
          <article key={subscription.id}>
            <div className="subscription-summary">
              <div className="source-info">
                <strong>{subscription.name}</strong>
                <span className="muted">{subscription.url}</span>
              </div>
              <span className="muted">
                {subscription.enabled ? `${subscription.sourceCount} 个源` : "已停用"}
              </span>
            </div>
            {subscription.updatedAt && (
              <p className="muted">上次更新：{new Date(subscription.updatedAt).toLocaleString()}</p>
            )}
            {subscription.error && (
              <p role="status" className="alert">
                刷新失败，保留上次列表：{subscription.error}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                aria-label={`编辑${subscription.name}`}
                onClick={() => openForm(subscription)}
              >
                编辑
              </button>
              <button
                type="button"
                className="danger-subtle"
                disabled={disabled}
                aria-label={`移除${subscription.name}`}
                onClick={() =>
                  void perform("移除订阅", () => mansouApi.deleteSourceRepository(subscription.id))
                }
              >
                移除
              </button>
            </div>
          </article>
        ))}
        {repository?.subscriptions.length === 0 && (
          <p className="muted">暂无订阅，请添加或恢复默认订阅。</p>
        )}
      </div>
      <div className="actions">
        <button type="button" disabled={disabled || !repository} onClick={() => openForm()}>
          添加订阅
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => void perform("恢复默认订阅", mansouApi.resetSourceRepository)}
        >
          恢复默认订阅
        </button>
      </div>
      {operation && <LoadingStatus label={`正在${operation}…`} />}
      {message && <p role="status">{message}</p>}
      {formOpen && (
        <form className="subscription-form" onSubmit={save}>
          <h3>{editing ? "编辑订阅" : "添加订阅"}</h3>
          <label>
            订阅名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              disabled={disabled}
            />
          </label>
          <label>
            订阅地址
            <input
              type="url"
              pattern="https?://.*"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              disabled={disabled}
              placeholder="https://example.com/index.json"
            />
          </label>
          <label>
            脚本下载地址（可选）
            <input
              type="url"
              pattern="https?://.*"
              value={cdnBaseUrl}
              onChange={(event) => setCdnBaseUrl(event.target.value)}
              disabled={disabled}
              placeholder="留空则相对于订阅地址下载"
            />
          </label>
          <label className="subscription-enabled">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              disabled={disabled}
            />
            启用此订阅
          </label>
          <p className="muted">
            保存时验证订阅，失败保留原配置。修改名称或地址保留订阅
            ID，已安装源继续绑定此订阅。恢复默认仅恢复默认订阅，保留其他订阅。
          </p>
          <div className="actions">
            <button disabled={disabled || !name.trim() || !url.trim()}>保存订阅并刷新</button>
            <button
              type="button"
              className="secondary-button"
              disabled={disabled}
              onClick={() => setFormOpen(false)}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
