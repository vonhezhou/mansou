export type SearchPreferences = {
  sourceKey: string;
  searchMode: "single" | "aggregate";
  aggregateSourceKeys?: string[];
};

const preferencesKey = "mansou:search-preferences";
const historyKey = "mansou:search-history";
export const searchHistoryLimit = 20;

function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储被禁用或空间不足时，搜索和本次会话的操作仍然可用。
  }
}

export function readSearchPreferences(): SearchPreferences {
  const value = readStored(preferencesKey);
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    sourceKey: typeof stored.sourceKey === "string" ? stored.sourceKey : "",
    searchMode: stored.searchMode === "aggregate" ? "aggregate" : "single",
    aggregateSourceKeys: Array.isArray(stored.aggregateSourceKeys)
      ? [
          ...new Set(
            stored.aggregateSourceKeys.filter(
              (key): key is string => typeof key === "string" && !!key,
            ),
          ),
        ]
      : undefined,
  };
}

export function saveSearchPreferences(preferences: SearchPreferences) {
  writeStored(preferencesKey, preferences);
}

export function readSearchHistory(): string[] {
  const value = readStored(historyKey);
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((term): term is string => typeof term === "string")
            .map((term) => term.trim())
            .filter(Boolean),
        ),
      ].slice(0, searchHistoryLimit)
    : [];
}

export function saveSearchHistory(history: string[]) {
  writeStored(historyKey, history);
}

export function addSearchHistory(history: string[], keyword: string) {
  const term = keyword.trim();
  return term
    ? [term, ...history.filter((item) => item !== term)].slice(0, searchHistoryLimit)
    : history;
}
