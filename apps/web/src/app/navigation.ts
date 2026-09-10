export const navigationItems = [
  { key: "search", label: "搜索" },
  { key: "history", label: "历史" },
  { key: "downloads", label: "下载" },
  { key: "sources", label: "源管理" },
] as const;

export type TabKey = (typeof navigationItems)[number]["key"];

export function isTabKey(value: string): value is TabKey {
  return navigationItems.some((item) => item.key === value);
}
