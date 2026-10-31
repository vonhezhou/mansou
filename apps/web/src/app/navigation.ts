export const navigationItems = [
  { key: "search", label: "漫画搜索", icon: "search" },
  { key: "novels", label: "小说搜索", icon: "book-open" },
  { key: "downloads", label: "下载任务", icon: "download" },
  { key: "sources", label: "漫画源", icon: "stack" },
  { key: "novel-sources", label: "小说源", icon: "library" },
  { key: "settings", label: "系统设置", icon: "settings" },
] as const;

export type TabKey = (typeof navigationItems)[number]["key"];

export function isTabKey(value: string): value is TabKey {
  return navigationItems.some((item) => item.key === value);
}
