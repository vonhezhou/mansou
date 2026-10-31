import { useEffect, useRef, useState, type FormEvent } from "react";
import type { components } from "@mansou/contracts";
import { mansouApi } from "../../api/mansou.js";
import type { RepositorySource } from "../../types.js";
import { AppDialog } from "../../app/AppDialog.js";
import { Icon } from "../../app/Icon.js";
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
  const [operation, setOperation] = useState<{ label: string; id?: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cdnBaseUrl, setCdnBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const submitting = useRef(false);
  const disabled = busy || loading || operation !== null;
  useEffect(() => {
    if (busy) return;
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
  }, [attempt, busy]);
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
  async function perform(label: string, action: () => Promise<Repository>, id?: string) {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setOperation({ label, id });
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
      setOperation(null);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const settings = { name: name.trim(), url: url.trim(), cdnBaseUrl: cdnBaseUrl.trim(), enabled };
    void perform(
      "保存订阅",
      () =>
        editing
          ? mansouApi.updateSourceRepository(editing, settings)
          : mansouApi.createSourceRepository(settings),
      editing ?? undefined,
    );
  }
  return (
    <section className="installed-sources subscription-settings" aria-label="漫画源订阅">
      <header className="subscription-heading">
        <div className="section-heading">
          <h3>漫画源订阅</h3>
          {repository && <span className="count-badge">{repository.subscriptions.length}</span>}
        </div>
        <div className="actions">
          <button
            type="button"
            className="secondary-button"
            disabled={disabled}
            onClick={() => void perform("恢复默认订阅", mansouApi.resetSourceRepository, "default")}
          >
            恢复默认订阅
          </button>
          <button
            type="button"
            className="button-with-icon"
            disabled={disabled || !repository}
            onClick={() => openForm()}
          >
            <Icon name="plus" size={17} />
            添加订阅
          </button>
        </div>
      </header>
      <p className="muted subscription-description">
        订阅提供可安装的漫画源。停用或移除订阅不会卸载已安装源。
      </p>
      {loading && <LoadingStatus label="正在加载订阅配置…" />}
      {error && !formOpen && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!repository && !loading && (
        <button onClick={() => setAttempt((value) => value + 1)}>重试加载订阅</button>
      )}
      <div className="source-list installed-source-grid subscription-list">
        {repository?.subscriptions.map((subscription) => {
          const pending = operation?.id === subscription.id;
          return (
            <article key={subscription.id} aria-busy={pending}>
              <span className="source-avatar" aria-hidden="true">
                <Icon name="stack" />
              </span>
              <div className="source-info">
                <strong>{subscription.name}</strong>
                <span className="muted">{subscription.url}</span>
              </div>
              <button
                type="button"
                className="source-switch"
                role="switch"
                aria-checked={subscription.enabled}
                aria-busy={pending}
                disabled={disabled}
                aria-label={`${subscription.enabled ? "停用" : "启用"}订阅 ${subscription.name}`}
                onClick={() =>
                  void perform(
                    subscription.enabled ? "停用订阅" : "启用订阅",
                    () =>
                      mansouApi.updateSourceRepository(subscription.id, {
                        name: subscription.name,
                        url: subscription.url,
                        cdnBaseUrl: subscription.cdnBaseUrl,
                        enabled: !subscription.enabled,
                      }),
                    subscription.id,
                  )
                }
              >
                <span className={pending ? "loading-spinner" : undefined} />
              </button>
              <div className="source-card-meta">
                <span>
                  漫画源 <b>{subscription.sourceCount} 个</b>
                </span>
                <span role="status" className={subscription.enabled ? "source-enabled" : "muted"}>
                  {pending ? `正在${operation.label}…` : subscription.enabled ? "已启用" : "已停用"}
                </span>
              </div>
              {subscription.updatedAt && (
                <p className="subscription-updated muted">
                  上次更新：{new Date(subscription.updatedAt).toLocaleString("zh-CN")}
                </p>
              )}
              {subscription.error && (
                <p role="status" className="alert subscription-error">
                  刷新失败，保留上次列表：{subscription.error}
                </p>
              )}
              <div className="source-actions">
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
                    void perform(
                      "移除订阅",
                      () => mansouApi.deleteSourceRepository(subscription.id),
                      subscription.id,
                    )
                  }
                >
                  移除
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {repository?.subscriptions.length === 0 && (
        <p className="muted">暂无订阅，请添加或恢复默认订阅。</p>
      )}
      {operation && <LoadingStatus label={`正在${operation.label}…`} />}
      {message && <p role="status">{message}</p>}
      {formOpen && (
        <AppDialog
          title={editing ? "编辑订阅" : "添加订阅"}
          onClose={() => {
            setFormOpen(false);
            setError("");
          }}
        >
          <form className="subscription-form" onSubmit={save}>
            {error && (
              <p role="alert" className="alert">
                {error}
              </p>
            )}
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
        </AppDialog>
      )}
    </section>
  );
}
