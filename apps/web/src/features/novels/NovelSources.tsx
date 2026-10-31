import { useId, useState } from "react";
import { AppDialog } from "../../app/AppDialog.js";
import { PageTabs } from "../../app/PageTabs.js";
import { novelApi, type NovelState } from "../../api/novels.js";

type Props = {
  state: NovelState;
  busy: boolean;
  error?: string;
  run: (work: () => Promise<void>) => Promise<void>;
  onChange: (state: NovelState) => void;
};

export function NovelSources({ state, busy, error, run, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<"installed" | "subscriptions">("installed");
  const [editorOpen, setEditorOpen] = useState(false);
  const tabId = useId();
  const [rules, setRules] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [subscriptionId, setSubscriptionId] = useState<string>();
  const [filter, setFilter] = useState("");
  const [supportedOnly, setSupportedOnly] = useState(false);
  const visibleSources = state.sources.filter(
    (source) =>
      (!supportedOnly || (source.searchSupported && source.downloadSupported)) &&
      `${source.name} ${source.url}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section className="inner-page source-tools">
      <header className="page-title">
        <div>
          <span className="eyebrow">SOURCE LIBRARY</span>
          <h1>小说源</h1>
          <p>
            {activeTab === "installed"
              ? `已导入 ${state.sources.length} 个书源，启用 ${state.sources.filter((source) => source.enabled).length} 个。`
              : "管理提供小说书源 JSON 合集的订阅。"}
          </p>
        </div>
        {activeTab === "installed" && (
          <button
            onClick={() => {
              setRules("");
              setEditorOpen(true);
            }}
          >
            导入书源
          </button>
        )}
      </header>
      <PageTabs
        id={tabId}
        label="小说源管理"
        tabs={[
          { key: "installed", label: "已导入源" },
          { key: "subscriptions", label: "订阅管理" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />
      {editorOpen && (
        <AppDialog title="导入与编辑书源" wide onClose={() => setEditorOpen(false)}>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <section className="novel-panel">
            <h2>自定义书源</h2>
            <p className="muted">
              粘贴或上传阅读书源
              JSON，支持单个书源或合集。相同地址会替换自定义规则，下载中的任务保留原规则。
            </p>
            <label>
              上传书源文件
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > 8 * 1024 * 1024) throw new Error("书源文件不能超过 8 MiB");
                      setRules(await file.text());
                    });
                  event.target.value = "";
                }}
              />
            </label>
            <label>
              书源 JSON
              <textarea
                className="novel-rule-editor"
                rows={8}
                value={rules}
                onChange={(event) => setRules(event.target.value)}
                spellCheck={false}
              />
            </label>
            <button
              disabled={busy || !rules.trim()}
              onClick={() =>
                void run(async () => {
                  onChange(await novelApi.import(JSON.parse(rules)));
                  setRules("");
                  setEditorOpen(false);
                })
              }
            >
              保存为自定义书源
            </button>
          </section>
        </AppDialog>
      )}
      <div
        role="tabpanel"
        id={`${tabId}-subscriptions-panel`}
        aria-labelledby={`${tabId}-subscriptions-tab`}
        hidden={activeTab !== "subscriptions"}
      >
        <section className="novel-panel">
          <h2>书源订阅</h2>
          <p className="muted">
            支持书源 JSON 合集及静态 RSS
            管理页订阅。刷新会更新规则并保留启停设置；部分合集失败时保留未更新的旧规则，不执行网页脚本或
            WebView。
          </p>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setName("喵公子书源");
              setUrl("http://yuedu.miaogongzi.net/shuyuan/miaogongziDY.json");
              setSubscriptionId(undefined);
            }}
          >
            填入喵公子订阅
          </button>
          <form
            className="novel-inline"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                onChange(await novelApi.subscription({ name, url }, subscriptionId));
                setName("");
                setUrl("");
                setSubscriptionId(undefined);
              });
            }}
          >
            <label>
              订阅名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
              />
            </label>
            <label>
              订阅地址
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
            </label>
            <button disabled={busy}>{subscriptionId ? "保存订阅" : "添加订阅"}</button>
            {subscriptionId && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSubscriptionId(undefined);
                  setName("");
                  setUrl("");
                }}
              >
                取消编辑
              </button>
            )}
          </form>
          {state.subscriptions
            .filter((group) => group.id !== "local")
            .map((group) => (
              <article className="novel-row" key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <p className="muted">
                    {group.count} 个源 · {group.enabled ? "已启用" : "已停用"}
                  </p>
                  <p className="novel-url">{group.url}</p>
                  {group.updatedAt && (
                    <small>上次成功更新：{new Date(group.updatedAt).toLocaleString()}</small>
                  )}
                  {group.error && <p role="alert">订阅提示：{group.error}</p>}
                </div>
                <div className="novel-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      setSubscriptionId(group.id);
                      setName(group.name);
                      setUrl(group.url ?? "");
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        onChange(await novelApi.refresh(group.id));
                      })
                    }
                  >
                    刷新
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        onChange(
                          await novelApi.subscription(
                            { name: group.name, url: group.url!, enabled: !group.enabled },
                            group.id,
                          ),
                        );
                      })
                    }
                  >
                    {group.enabled ? "停用订阅" : "启用订阅"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`移除订阅“${group.name}”及其书源？已有下载任务会保留。`))
                        void run(async () => {
                          onChange(await novelApi.removeSubscription(group.id));
                        });
                    }}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))}
        </section>
      </div>
      <div
        role="tabpanel"
        id={`${tabId}-installed-panel`}
        aria-labelledby={`${tabId}-installed-tab`}
        hidden={activeTab !== "installed"}
      >
        <section className="novel-panel">
          <h2>已导入书源（{state.sources.length}）</h2>
          <label>
            筛选书源
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="名称或地址"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={supportedOnly}
              onChange={(event) => setSupportedOnly(event.target.checked)}
            />
            仅显示支持搜索和下载的书源（无需 WebView）
          </label>
          <p className="muted">
            “支持”表示规则在当前实现范围内，不代表站点实时可用。订阅源编辑后另存为自定义源，不随订阅刷新覆盖。
          </p>
          <p className="muted">
            符合筛选条件：{visibleSources.length} / {state.sources.length} 个源
          </p>
          <div className="source-list installed-source-grid">
            {visibleSources.map((source) => (
              <article key={source.id}>
                <span className="source-avatar" aria-hidden="true">
                  {source.name.slice(0, 1)}
                </span>
                <div className="source-info">
                  <strong>{source.name}</strong>
                  <span className="muted">
                    {state.subscriptions.find((group) => group.id === source.groupId)?.name}
                  </span>
                  <span className="novel-url">{source.url}</span>
                </div>
                <button
                  className="source-switch"
                  role="switch"
                  aria-checked={source.enabled}
                  aria-label={`${source.enabled ? "禁用" : "启用"} ${source.name}`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      onChange(await novelApi.enabled(source.id, !source.enabled)),
                    )
                  }
                >
                  <span />
                </button>
                <div className="source-card-meta">
                  <span title={source.searchError}>
                    搜索 <b>{source.searchSupported ? "支持" : "不支持"}</b>
                  </span>
                  <span title={source.downloadError}>
                    下载 <b>{source.downloadSupported ? "支持" : "不支持"}</b>
                  </span>
                </div>
                <div className="source-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setRules(JSON.stringify(await novelApi.rule(source.id), null, 2));
                        setEditorOpen(true);
                      })
                    }
                  >
                    编辑规则
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(`删除书源“${source.name}”？订阅中的源下次刷新时会重新出现。`)
                      )
                        void run(async () => {
                          onChange(await novelApi.removeSource(source.id));
                        });
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!visibleSources.length && (
            <p className="muted">
              {state.sources.length
                ? "没有符合条件的书源，请调整筛选条件。"
                : "暂无书源，请导入 JSON 或添加订阅。"}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
