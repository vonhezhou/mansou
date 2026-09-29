import type { ReactNode } from "react";
import type { Health } from "../types.js";
import { Icon } from "./Icon.js";

type SettingsViewProps = {
  health: Health | null;
  busy: boolean;
  account?: ReactNode;
  onRefresh: () => void;
  theme: string;
  onToggleTheme: () => void;
};

export function SettingsView(props: SettingsViewProps) {
  return (
    <section className="inner-page settings-page">
      <header className="page-title">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h1>系统设置</h1>
          <p>查看服务器连接、外观与账号设置。</p>
        </div>
        <button className="secondary-button" onClick={props.onRefresh} disabled={props.busy}>
          {props.busy ? "刷新中…" : "刷新状态"}
        </button>
      </header>
      <section className="settings-panel">
        <h2>服务器与存储</h2>
        <div className="setting-row">
          <span className="setting-icon">
            <Icon name="server" />
          </span>
          <div>
            <strong>服务器连接</strong>
            <span>当前 Web 控制台地址</span>
          </div>
          <code>{window.location.origin}</code>
        </div>
        <div className="setting-row">
          <span className="setting-icon">
            <Icon name="check" />
          </span>
          <div>
            <strong>运行状态</strong>
            <span>服务器健康检查</span>
          </div>
          <span className={`health ${props.health?.ok ? "online" : "offline"}`}>
            {props.health?.ok ? "服务在线" : "服务未连接"}
          </span>
        </div>
        <div className="setting-row">
          <span className="setting-icon">
            <Icon name="folder" />
          </span>
          <div>
            <strong>数据目录</strong>
            <span>服务器的数据存储位置</span>
          </div>
          <code>{props.health?.dataDir ?? "暂不可用"}</code>
        </div>
      </section>
      <section className="settings-panel">
        <h2>界面外观</h2>
        <div className="setting-row">
          <span className="setting-icon">
            <Icon name={props.theme === "dark" ? "moon" : "sun"} />
          </span>
          <div>
            <strong>{props.theme === "dark" ? "暗色模式" : "浅色模式"}</strong>
            <span>外观偏好保存在当前浏览器中</span>
          </div>
          <button className="secondary-button" onClick={props.onToggleTheme}>
            切换主题
          </button>
        </div>
      </section>
      <section className="settings-panel">
        <h2>账号与访问</h2>
        {props.account ?? <p className="muted">当前服务未启用登录验证。</p>}
      </section>
    </section>
  );
}
