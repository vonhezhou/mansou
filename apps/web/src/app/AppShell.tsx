import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Health } from "../types.js";
import { navigationItems, type TabKey } from "./navigation.js";
import { Icon } from "./Icon.js";
import { SettingsView } from "./SettingsView.js";

type AppShellProps = {
  activeTab: TabKey;
  busy: boolean;
  error: string | null;
  health: Health | null;
  downloadCount: number;
  sourceCount: number;
  children: ReactNode;
  account?: ReactNode;
  onRefresh: () => void;
  onTabChange: (tab: TabKey) => void;
};

export function AppShell(props: AppShellProps) {
  const workspaceRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "light");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [props.activeTab]);
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
  const themeLabel = theme === "dark" ? "切换为浅色模式" : "切换为暗色模式";
  const themeButton = (
    <button
      className="theme-toggle icon-button"
      onClick={toggleTheme}
      aria-label={themeLabel}
      title={themeLabel}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
  function navButton(item: (typeof navigationItems)[number]) {
    const count =
      item.key === "downloads"
        ? props.downloadCount
        : item.key === "sources"
          ? props.sourceCount
          : null;
    return (
      <button
        className={`nav-item${item.key === props.activeTab ? " active" : ""}`}
        aria-current={item.key === props.activeTab ? "page" : undefined}
        aria-label={item.label}
        title={item.label}
        key={item.key}
        onClick={() => props.onTabChange(item.key)}
      >
        <Icon name={item.icon} size={19} />
        <span>{item.label}</span>
        {count !== null && <b aria-label={`${count} 项`}>{count}</b>}
      </button>
    );
  }
  return (
    <div className={`shell${collapsed ? " sidebar-is-collapsed" : ""}`}>
      <a
        className="skip-link"
        href="#workspace"
        onClick={(event) => {
          event.preventDefault();
          workspaceRef.current?.focus();
        }}
      >
        跳到主要内容
      </a>
      <aside className="sidebar" aria-label="工作台侧栏">
        <button
          className="collapse-button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <Icon name="chevron" size={16} />
        </button>
        <div className="brand">
          <div className="brand-mark">
            <span>V</span>
          </div>
          <div className="brand-copy">
            <strong>Venera</strong>
            <span>WEB CONSOLE</span>
          </div>
        </div>
        <nav className="nav" aria-label="主要功能">
          <div className="nav-label">工作台</div>
          {navigationItems.filter((item) => item.key !== "settings").map(navButton)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tools">
            {navigationItems.filter((item) => item.key === "settings").map(navButton)}
            {themeButton}
          </div>
          <div className="server-card">
            <span className={`health ${props.health?.ok ? "online" : "offline"}`} role="status">
              {props.health?.ok ? "服务运行正常" : "服务未连接"}
            </span>
            <div className="server-row">
              <span>已安装漫画源</span>
              <strong>{props.sourceCount} 个</strong>
            </div>
            <div className="server-row">
              <span>进行中的任务</span>
              <strong>{props.downloadCount} 个</strong>
            </div>
          </div>
          <div className="server-profile">
            <span className="server-avatar">
              <Icon name="server" />
            </span>
            <div>
              <strong>Venera Server</strong>
              <span title={window.location.host}>{window.location.host}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-frame">
        <header className="mobile-header">
          <div className="mobile-brand">
            <span>V</span>
            <strong>Venera Web</strong>
          </div>
          {themeButton}
        </header>
        <nav className="mobile-nav" aria-label="移动端主要功能">
          {navigationItems.map(navButton)}
        </nav>
        <main ref={workspaceRef} id="workspace" className="workspace" tabIndex={-1}>
          {props.error && (
            <section className="alert workspace-alert" role="alert">
              {props.error}
            </section>
          )}
          {props.activeTab === "settings" ? (
            <SettingsView
              health={props.health}
              busy={props.busy}
              account={props.account}
              onRefresh={props.onRefresh}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          ) : (
            props.children
          )}
        </main>
      </div>
    </div>
  );
}
