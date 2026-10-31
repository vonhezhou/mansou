import { useId, useState } from "react";
import { AppDialog } from "../../app/AppDialog.js";
import { PageTabs } from "../../app/PageTabs.js";
import { novelApi, type NovelState, type NovelImportResult } from "../../api/novels.js";

import { NovelSourceList } from "./NovelSourceList.js";

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
  const [importResult, setImportResult] =
    useState<Pick<NovelImportResult, "importedCount" | "rejected">>();
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
              setImportResult(undefined);
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
      {!editorOpen && error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {editorOpen && (
        <AppDialog title="导入与编辑书源" wide onClose={() => setEditorOpen(false)}>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <section className="novel-panel">
            <h2>自定义书源</h2>
            {importResult && (
              <div className="novel-import-result" role="status">
                <p>
                  已导入 {importResult.importedCount} 个，拒绝 {importResult.rejected.length}{" "}
                  个不支持下载的书源。
                </p>
                {importResult.rejected.length > 0 && (
                  <details open={importResult.importedCount === 0}>
                    <summary>查看拒绝原因</summary>
                    <ul>
                      {importResult.rejected.map((item, index) => (
                        <li key={index}>
                          <strong>{item.name}</strong>：{item.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            <p className="muted">
              粘贴或上传阅读书源
              JSON，支持单个书源或合集。不支持下载的规则会被拒绝并列出原因，不覆盖已有规则。下载中的任务保留原规则。
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
                  const result = await novelApi.import(JSON.parse(rules));
                  onChange({ sources: result.sources, subscriptions: result.subscriptions });
                  setImportResult({
                    importedCount: result.importedCount,
                    rejected: result.rejected,
                  });
                  if (result.importedCount) setRules("");
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
            管理页订阅，仅保留支持下载的书源。刷新会更新规则并保留启停设置；部分合集失败时保留未更新的旧规则，不执行网页脚本或
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
        <NovelSourceList
          state={state}
          busy={busy}
          run={run}
          onChange={onChange}
          onEdit={(rules) => {
            setRules(rules);
            setImportResult(undefined);
            setEditorOpen(true);
          }}
        />
      </div>
    </section>
  );
}
