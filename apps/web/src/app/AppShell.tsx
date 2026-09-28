import type { ReactNode } from "react";
import type { Health } from "../types.js";
import { navigationItems, type TabKey } from "./navigation.js";

type AppShellProps = {
  activeTab: TabKey;
  busy: boolean;
  error: string | null;
  health: Health | null;
  children: ReactNode;
  onRefresh: () => void;
  onTabChange: (tab: TabKey) => void;
};

export function AppShell(props: AppShellProps) {
  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Venera Web</p>
          <h1>插件漫画源的 Web 控制台</h1>
          <p>
            聚合搜索、章节预览、下载任务和源管理已接入 `/api/v1`，正在从 PoC
            调试台推进为正式控制台。
          </p>
        </div>
        <div className="hero-actions">
          <span className={props.health?.ok ? "health online" : "health offline"}>
            {props.health?.ok ? "服务在线" : "服务未连接"}
          </span>
          <button onClick={props.onRefresh} disabled={props.busy}>
            刷新
          </button>
        </div>
      </header>

      {props.error && <section className="alert">{props.error}</section>}

      <nav className="tabs" aria-label="主要功能">
        {navigationItems.map((item) => (
          <button
            className={item.key === props.activeTab ? "active" : ""}
            key={item.key}
            onClick={() => props.onTabChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {props.children}
    </main>
  );
}
