import { useEffect, useState } from "react";
import type { components } from "@mansou/contracts";
import { mansouApi } from "../../api/mansou.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { Source } from "../../types.js";

type Group = components["schemas"]["SearchRecommendationGroup"];
type Props = {
  sources: Source[];
  sourceKey: string;
  searchMode: "single" | "aggregate";
  aggregateSourceKeys: string[];
  onSelect: (keyword: string) => void;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function SearchRecommendations(props: Props) {
  const aggregate = props.searchMode === "aggregate";
  const candidates = props.sources.filter(
    (source) =>
      source.hasSearch &&
      source.hasSearchRecommendations &&
      (!aggregate || props.aggregateSourceKeys.includes(source.key)),
  );
  const [preferredSourceKey, setPreferredSourceKey] = useState("");
  const source = aggregate
    ? (candidates.find((item) => item.key === preferredSourceKey) ?? candidates[0])
    : candidates.find((item) => item.key === props.sourceKey);
  const key = source?.key;
  const version = source?.version;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    version?: string;
    revision: number;
    groups?: Group[];
    error?: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
    if (!key) return;
    const controller = new AbortController();
    let active = true;
    void mansouApi.searchRecommendations(key, controller.signal).then(
      (groups) => {
        if (active)
          setResult({
            key,
            version,
            revision,
            groups: groups.map((group) => ({
              ...group,
              items: group.random ? shuffle(group.items) : group.items,
            })),
          });
      },
      (error: unknown) => {
        if (active)
          setResult({
            key,
            version,
            revision,
            error: error instanceof Error ? error.message : "加载失败",
          });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, version, revision]);

  if (!source) return null;
  const current =
    result && result.key === key && result.version === version && result.revision === revision
      ? result
      : null;
  const groups = current?.groups;
  // 聚合模式保留来源选择器，以便当前源无词条时仍能切换其他源。
  if (!aggregate && groups?.length === 0) return null;
  let remaining = expanded ? Infinity : 12;
  const shown = (groups ?? []).map((group) => {
    const count = Math.min(remaining, group.items.length, group.random ? group.limit : Infinity);
    remaining -= count;
    return { group, items: group.items.slice(0, count) };
  });
  const total = (groups ?? []).reduce(
    (sum, group) =>
      sum + (group.random ? Math.min(group.limit, group.items.length) : group.items.length),
    0,
  );

  return (
    <section className="search-recommendations" aria-label="源推荐词">
      <div className="recommendations-heading">
        <span>源推荐词</span>
        {aggregate ? (
          <label className="recommendations-source">
            词条来源
            <select
              aria-label="词条来源"
              value={source.key}
              onChange={(event) => setPreferredSourceKey(event.target.value)}
            >
              {candidates.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="muted">来自 {source.name}</span>
        )}
        <button
          type="button"
          className="quiet-button"
          disabled={!current}
          onClick={() => setRevision((value) => value + 1)}
        >
          刷新
        </button>
      </div>
      {!current && <LoadingStatus label="正在加载推荐词…" />}
      {current?.error && (
        <div role="status" className="recommendations-error">
          <span>推荐词加载失败：{current.error}</span>
          <button
            type="button"
            className="quiet-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            重试
          </button>
        </div>
      )}
      {groups?.length === 0 && <p className="muted">该源暂无可用的搜索推荐词，可切换词条来源。</p>}
      {shown.map(
        ({ group, items }) =>
          items.length > 0 && (
            <div className="recommendation-group" key={group.id}>
              <div className="recommendations-heading">
                <span>{group.title}</span>
                {group.random && group.items.length > items.length && (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() =>
                      setResult((value) =>
                        value?.groups
                          ? {
                              ...value,
                              groups: value.groups.map((item) =>
                                item.id === group.id
                                  ? { ...item, items: shuffle(item.items) }
                                  : item,
                              ),
                            }
                          : value,
                      )
                    }
                  >
                    换一批
                  </button>
                )}
              </div>
              <div className="recommendation-terms">
                {items.map((item) => (
                  <button
                    type="button"
                    className="recommendation-term"
                    title={item.keyword}
                    key={item.keyword}
                    onClick={() => props.onSelect(item.keyword)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ),
      )}
      {total > 12 && (
        <button
          type="button"
          className="quiet-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起推荐词" : "展开更多"}
        </button>
      )}
    </section>
  );
}
