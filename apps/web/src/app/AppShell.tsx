import { useState, type ReactNode } from "react";
import type { Health } from "../types.js";
import { navigationItems, type TabKey } from "./navigation.js";

type AppShellProps = {
  activeTab: TabKey;
  busy: boolean;
  error: string | null;
  health: Health | null;
  children: ReactNode;
  account?: ReactNode;
  onRefresh: () => void;
  onTabChange: (tab: TabKey) => void;
};

export function AppShell(props: AppShellProps) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "dark");
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("venera:theme", next);
    } catch {
      // 存储不可用时仍允许切换当前页面的主题。
    }
  }
  return (
    <div className="shell">
      <header className="app-header">
        <div className="brand-group">
          <span className="brand">Venera Web</span>
          <span className={props.health?.ok ? "health online" : "health offline"} role="status">
            {props.health?.ok ? "服务在线" : "服务未连接"}
          </span>
        </div>
        <nav className="tabs" aria-label="主要功能">
          {navigationItems.map((item) => (
            <button
              className={item.key === props.activeTab ? "active" : ""}
              aria-current={item.key === props.activeTab ? "page" : undefined}
              key={item.key}
              onClick={() => props.onTabChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="quiet-button theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换为浅色模式" : "切换为暗色模式"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <details className="workspace-menu">
            <summary>设置</summary>
            <div className="workspace-menu-content">
              <div className="service-status">
                <button onClick={props.onRefresh} disabled={props.busy}>
                  刷新
                </button>
              </div>
              {props.account}
            </div>
          </details>
        </div>
      </header>
      <main className="workspace">
        {props.error && (
          <section className="alert" role="alert">
            {props.error}
          </section>
        )}
        {props.children}
      </main>
    </div>
  );
}
