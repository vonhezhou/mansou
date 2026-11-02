import { useEffect, useMemo, useRef, useState } from "react";
import { novelApi, type NovelState } from "../../api/novels.js";
import { NovelAccountDialog } from "./NovelAccountDialog.js";

type Props = {
  state: NovelState;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onChange: (state: NovelState) => void;
  onEdit: (rules: string) => void;
};
const pageSize = 50;
export function NovelSourceList({ state, busy, run, onChange, onEdit }: Props) {
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState("all");
  const [enabled, setEnabled] = useState("all");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set<string>());
  const [notice, setNotice] = useState("");
  const [accountSource, setAccountSource] = useState<{ id: string; name: string }>();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const ids = new Set(state.sources.map((source) => source.id));
    setAccountSource((old) => (old && ids.has(old.id) ? old : undefined));
    setSelected((old) => new Set([...old].filter((id) => ids.has(id))));
  }, [state.sources]);
  useEffect(() => {
    // 改变筛选即清空选择，避免对已经隐藏的书源执行批量操作。
    setPage(1);
    setSelected(new Set());
    setNotice("");
  }, [query, capability, enabled, group, favoritesOnly]);
  const groups = useMemo(
    () => new Map(state.subscriptions.map((item) => [item.id, item.name])),
    [state.subscriptions],
  );
  const filtered = useMemo(
    () =>
      state.sources
        .filter(
          (source) =>
            `${source.name} ${source.url}`.toLowerCase().includes(query.trim().toLowerCase()) &&
            (capability === "all" ||
              (capability === "supported"
                ? source.searchSupported && source.downloadSupported
                : !source.downloadSupported)) &&
            (enabled === "all" || source.enabled === (enabled === "enabled")) &&
            (group === "all" || source.groupId === group) &&
            (!favoritesOnly || source.favorite),
        )
        .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)),
    [state.sources, query, capability, enabled, group, favoritesOnly],
  );
  const ids = useMemo(() => new Set(filtered.map((source) => source.id)), [filtered]);
  const selection = [...selected].filter((id) => ids.has(id));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const allOnPage = visible.length > 0 && visible.every((source) => selected.has(source.id));
  const toggle = (id: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const batch = (action: "enable" | "disable" | "delete") => {
    if (!selection.length || busy) return;
    if (
      action === "delete" &&
      !window.confirm(
        `删除选中的 ${selection.length} 个书源？已有下载任务保留；订阅源下次刷新可能重新出现。`,
      )
    )
      return;
    void run(async () => {
      onChange(await novelApi.batch(selection, action));
      setSelected(new Set());
      setNotice(
        `已${action === "delete" ? "删除" : action === "enable" ? "启用" : "停用"} ${selection.length} 个书源`,
      );
    });
  };
  const pagination = (
    <nav className="novel-source-pagination" aria-label="书源分页">
      <button
        className="secondary-button"
        disabled={busy || current === 1}
        onClick={() => changePage(1)}
      >
        首页
      </button>
      <button
        className="secondary-button"
        disabled={busy || current === 1}
        onClick={() => changePage(current - 1)}
      >
        上一页
      </button>
      <span>
        {current} / {pages}
      </span>
      <button
        className="secondary-button"
        disabled={busy || current === pages}
        onClick={() => changePage(current + 1)}
      >
        下一页
      </button>
      <button
        className="secondary-button"
        disabled={busy || current === pages}
        onClick={() => changePage(pages)}
      >
        末页
      </button>
    </nav>
  );
  function changePage(value: number) {
    setPage(value);
    panel.current?.scrollIntoView?.({ block: "start" });
  }
  return (
    <section ref={panel} className="novel-panel" aria-label="已导入书源">
      <h2>已导入书源（{state.sources.length}）</h2>
      <div className="novel-source-filters">
        <label>
          筛选书源
          <input
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="名称或地址"
          />
        </label>
        <label>
          规则能力
          <select
            value={capability}
            disabled={busy}
            onChange={(event) => setCapability(event.target.value)}
          >
            <option value="all">全部规则</option>
            <option value="supported">支持搜索和下载</option>
            <option value="unsupported">不支持下载</option>
          </select>
        </label>
        <label>
          启停状态
          <select
            value={enabled}
            disabled={busy}
            onChange={(event) => setEnabled(event.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已停用</option>
          </select>
        </label>
        <label>
          所属订阅
          <select value={group} disabled={busy} onChange={(event) => setGroup(event.target.value)}>
            <option value="all">全部订阅</option>
            {state.subscriptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="novel-checkbox source-favorite-filter">
        <input
          type="checkbox"
          checked={favoritesOnly}
          disabled={busy}
          onChange={(event) => setFavoritesOnly(event.target.checked)}
        />
        仅看收藏（{state.sources.filter((source) => source.favorite).length}）
      </label>
      <p className="muted">
        收藏优先显示；订阅更新会保留收藏，收藏源从订阅消失时保留最后一次规则。
      </p>
      <p className="muted">
        “支持”表示规则在当前实现范围内，不代表站点实时可用。订阅源编辑后另存为自定义源。
      </p>
      <div className="novel-source-batch" aria-label="书源批量操作">
        <label className="novel-checkbox">
          <input
            type="checkbox"
            disabled={busy || !visible.length}
            checked={allOnPage}
            onChange={() =>
              setSelected((old) => {
                const next = new Set(old);
                for (const source of visible)
                  if (allOnPage) next.delete(source.id);
                  else next.add(source.id);
                return next;
              })
            }
          />
          选择本页
        </label>
        <button
          className="secondary-button"
          disabled={busy || !filtered.length || filtered.length > 2000}
          onClick={() => setSelected(new Set(filtered.map((source) => source.id)))}
        >
          选择全部筛选结果（{filtered.length}）
        </button>
        <button
          className="quiet-button"
          disabled={busy || !selection.length}
          onClick={() => setSelected(new Set())}
        >
          清空选择
        </button>
        <span role="status">已选 {selection.length} 个</span>
        <button
          className="secondary-button"
          disabled={busy || !selection.length}
          onClick={() => batch("enable")}
        >
          批量启用
        </button>
        <button
          className="secondary-button"
          disabled={busy || !selection.length}
          onClick={() => batch("disable")}
        >
          批量停用
        </button>
        <button
          className="secondary-button"
          disabled={busy || !selection.length}
          onClick={() => batch("delete")}
        >
          批量删除
        </button>
      </div>
      <p className="muted">
        符合筛选条件：{filtered.length} / {state.sources.length} 个源；每页 {pageSize} 个。
        {filtered.length > 2000 && "单次最多操作 2000 个，请缩小筛选范围。"}
      </p>
      {notice && <p role="status">{notice}</p>}
      {pagination}
      <div className="source-list installed-source-grid">
        {visible.map((source) => (
          <article key={source.id}>
            <label className="novel-checkbox novel-source-select">
              <input
                type="checkbox"
                aria-label={`选择 ${source.name}`}
                checked={selected.has(source.id)}
                disabled={busy}
                onChange={() => toggle(source.id)}
              />
              选择此源
            </label>
            <span className="source-avatar" aria-hidden="true">
              {source.name.slice(0, 1)}
            </span>
            <div className="source-info">
              <strong>{source.name}</strong>
              <span className="muted">{groups.get(source.groupId)}</span>
              <span className="novel-url">{source.url}</span>
              {source.missingFromSubscription && (
                <span className="muted">已从订阅移除，保留收藏规则（可能已失效）</span>
              )}
            </div>
            <button
              className="source-switch"
              role="switch"
              aria-checked={source.enabled}
              aria-label={`${source.enabled ? "禁用" : "启用"} ${source.name}`}
              disabled={busy}
              onClick={() =>
                void run(async () => onChange(await novelApi.enabled(source.id, !source.enabled)))
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
                onClick={() => setAccountSource(source)}
              >
                账号与会话
              </button>
              <button
                className="secondary-button"
                aria-label={`${source.favorite ? "取消收藏" : "收藏"} ${source.name}`}
                aria-pressed={!!source.favorite}
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    onChange(await novelApi.favorite(source.id, !source.favorite)),
                  )
                }
              >
                {source.favorite ? "★ 已收藏" : "☆ 收藏"}
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    onEdit(JSON.stringify(await novelApi.rule(source.id), null, 2)),
                  )
                }
              >
                编辑规则
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`删除书源“${source.name}”？订阅中的源下次刷新时会重新出现。`))
                    void run(async () => onChange(await novelApi.removeSource(source.id)));
                }}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p className="muted">
          {state.sources.length
            ? "没有符合条件的书源，请调整筛选条件。"
            : "暂无书源，请导入 JSON 或添加订阅。"}
        </p>
      )}
      {pagination}
      {accountSource && (
        <NovelAccountDialog
          key={accountSource.id}
          source={accountSource}
          onClose={() => setAccountSource(undefined)}
        />
      )}
    </section>
  );
}
