import { LoadingStatus } from "./LoadingStatus.js";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Health } from "../types.js";
import { navigationItems, type TabKey } from "./navigation.js";
import { Icon } from "./Icon.js";
import { SettingsView } from "./SettingsView.js";
import { readServerPreferences, subscribeServers } from "../lib/servers.js";
import type { DownloadSnapshotStore } from "../lib/downloadSnapshot.js";

type AppShellProps = {
  activeTab: TabKey;
  busy: boolean;
  error: string | null;
  notice?: string;
  health: Health | null;
  downloadStore: DownloadSnapshotStore;
  sourceCount: number;
  novelDownloadStore: Pick<DownloadSnapshotStore, "subscribe" | "getActiveCount">;
  children: ReactNode;
  account?: ReactNode;
  onRefresh: () => void;
  onTabChange: (tab: TabKey) => void;
};

export function AppShell(props: AppShellProps) {
  const downloadCount = useSyncExternalStore(
    props.downloadStore.subscribe,
    props.downloadStore.getActiveCount,
  );
  const novelDownloadCount = useSyncExternalStore(
    props.novelDownloadStore.subscribe,
    props.novelDownloadStore.getActiveCount,
  );
  const [serverPreferences, setServerPreferences] = useState(readServerPreferences);
  const currentServer = serverPreferences.servers.find(
    (server) => server.origin === window.location.origin,
  );
  const serverName =
    currentServer?.name === "当前服务器" ? "漫搜服务器" : (currentServer?.name ?? "漫搜服务器");
  useEffect(() => subscribeServers(() => setServerPreferences(readServerPreferences())), []);
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
      localStorage.setItem("mansou:theme", next);
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
        ? downloadCount + novelDownloadCount
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
            <span>M</span>
          </div>
          <div className="brand-copy">
            <strong>漫搜</strong>
            <span>MANSOU</span>
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
          <button
            type="button"
            className="server-profile"
            aria-label="管理与切换漫搜服务器"
            title="管理与切换漫搜服务器"
            onClick={() => props.onTabChange("settings")}
          >
            <span className="server-avatar">
              <Icon name="server" />
            </span>
            <span className="server-profile-copy">
              <strong>{serverName}</strong>
              <span title={window.location.host}>{window.location.host}</span>
            </span>
          </button>
        </div>
      </aside>
      <div className="workspace-frame">
        <header className="mobile-header">
          <div className="mobile-brand">
            <span>M</span>
            <strong>漫搜</strong>
          </div>
          {themeButton}
        </header>
        <nav className="mobile-nav" aria-label="移动端主要功能">
          {navigationItems.map(navButton)}
        </nav>
        <main ref={workspaceRef} id="workspace" className="workspace" tabIndex={-1}>
          {props.busy && (
            <div className="workspace-alert">
              <LoadingStatus label="正在更新漫画源、下载任务与缓存信息…" />
            </div>
          )}
          {props.notice && (
            <p className="workspace-alert connection-notice" role="status">
              {props.notice}
            </p>
          )}
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
