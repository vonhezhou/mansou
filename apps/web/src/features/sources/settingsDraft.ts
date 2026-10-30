// 源操作只同步未编辑的字段，保留表单中尚未保存的修改（包括删除字段）。
export function mergeSettingsDraft(
  previous: Record<string, unknown>,
  draft: string,
  next: Record<string, unknown>,
) {
  let values: Record<string, unknown>;
  try {
    const parsed = JSON.parse(draft);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return draft;
    values = parsed;
  } catch {
    return draft;
  }
  const merged = new Map(Object.entries(next));
  for (const key of new Set([...Object.keys(previous), ...Object.keys(values)])) {
    if (JSON.stringify(values[key]) === JSON.stringify(previous[key])) continue;
    if (Object.hasOwn(values, key)) merged.set(key, values[key]);
    else merged.delete(key);
  }
  return JSON.stringify(Object.fromEntries(merged), null, 2);
}
