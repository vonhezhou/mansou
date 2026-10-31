import { useState } from "react";
import { novelApi, type NovelState } from "../../api/novels.js";

type Props = {
  state: NovelState;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onChange: (state: NovelState) => void;
};

export function NovelSources({ state, busy, run, onChange }: Props) {
  const [rules, setRules] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [subscriptionId, setSubscriptionId] = useState<string>();
  const [filter, setFilter] = useState("");
  return (
    <div className="novel-stack">
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
            })
          }
        >
          保存为自定义书源
        </button>
      </section>
      <section className="novel-panel">
        <h2>书源订阅</h2>
        <p className="muted">
          订阅地址需直接返回书源 JSON
          合集。手动刷新会更新规则并移除合集已删除的源，保留已有启停设置；管理页订阅暂不支持。
        </p>
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
                {group.error && <p role="alert">上次更新失败：{group.error}，已保留旧规则。</p>}
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
        <p className="muted">
          “支持”表示规则在当前实现范围内，不代表站点实时可用。订阅源编辑后另存为自定义源，不随订阅刷新覆盖。
        </p>
        {state.sources
          .filter((source) =>
            `${source.name} ${source.url}`.toLowerCase().includes(filter.toLowerCase()),
          )
          .map((source) => (
            <article className="novel-row" key={source.id}>
              <div>
                <strong>{source.name}</strong>
                <span className="muted">
                  {" "}
                  · {state.subscriptions.find((group) => group.id === source.groupId)?.name}
                </span>
                <p className="novel-url">{source.url}</p>
                <p className="muted">
                  搜索：{source.searchSupported ? "支持" : source.searchError} · 下载：
                  {source.downloadSupported ? "支持" : source.downloadError}
                </p>
              </div>
              <div className="novel-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      onChange(await novelApi.enabled(source.id, !source.enabled));
                    })
                  }
                >
                  {source.enabled ? "停用" : "启用"}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setRules(JSON.stringify(await novelApi.rule(source.id), null, 2));
                      window.scrollTo({ top: 0, behavior: "smooth" });
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
        {!state.sources.length && <p className="muted">暂无书源，请导入 JSON 或添加订阅。</p>}
      </section>
    </div>
  );
}
