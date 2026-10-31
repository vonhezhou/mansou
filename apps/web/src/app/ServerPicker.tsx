import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./Icon.js";
import { AppDialog } from "./AppDialog.js";
import {
  normalizeServerOrigin,
  readServerPreferences,
  saveServerPreferences,
  serverLimit,
  subscribeServers,
  switchServer,
} from "../lib/servers.js";

const connectionLabels = { online: "在线", offline: "未连接", checking: "检查中…" };

export function ServerPicker({
  connectionStatus,
}: {
  connectionStatus?: keyof typeof connectionLabels;
}) {
  const [preferences, setPreferences] = useState(readServerPreferences);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  useEffect(() => subscribeServers(() => setPreferences(readServerPreferences())), []);

  function run(action: () => void) {
    try {
      action();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setName("");
    setAddress("");
    setError("");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const connect =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "connect";
    run(() => {
      const origin = normalizeServerOrigin(address);
      if (!name.trim()) throw new Error("请输入服务器名称");
      if (editing === window.location.origin && origin !== editing)
        throw new Error("当前服务器只能修改名称；其他地址请添加为新服务器");
      const latest = readServerPreferences();
      if (latest.servers.some((server) => server.origin === origin && server.origin !== editing))
        throw new Error("该服务器地址已保存");
      if (!editing && latest.servers.length >= serverLimit)
        throw new Error(`最多保存 ${serverLimit} 台服务器`);
      const server = { name: name.trim(), origin };
      const servers = editing
        ? latest.servers.map((item) => (item.origin === editing ? server : item))
        : [...latest.servers, server];
      saveServerPreferences({
        servers,
        lastOrigin: latest.lastOrigin === editing ? origin : latest.lastOrigin,
      });
      closeForm();
      if (connect) switchServer(origin);
    });
  }

  return (
    <div className="server-picker">
      {error && !formOpen && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="server-picker-heading">
        <div>
          <h2>
            漫搜服务器{" "}
            <span
              className="count-badge"
              aria-label={`已保存 ${preferences.servers.length} 台服务器`}
            >
              {preferences.servers.length}
            </span>
          </h2>
          <p>管理常用连接，选择要使用的服务器。</p>
        </div>
        <button
          type="button"
          className="button-with-icon"
          onClick={() => {
            closeForm();
            setFormOpen(true);
          }}
        >
          <Icon name="plus" size={17} />
          添加服务器
        </button>
      </div>
      <div className="source-list installed-source-grid saved-servers">
        {preferences.servers.map((server) => (
          <article
            key={server.origin}
            className={
              server.origin === window.location.origin ? "saved-server-current" : undefined
            }
          >
            <span className="source-avatar" aria-hidden="true">
              <Icon name="server" />
            </span>
            <div className="source-info">
              <div className="saved-server-title">
                <strong>{server.name}</strong>
                {server.origin === window.location.origin && (
                  <span
                    role="status"
                    className={`saved-server-status${connectionStatus ? ` saved-server-status-${connectionStatus}` : ""}`}
                  >
                    <Icon name="check" size={14} />
                    当前使用{connectionStatus ? ` · ${connectionLabels[connectionStatus]}` : ""}
                  </span>
                )}
              </div>
              <span className="muted">{server.origin}</span>
            </div>
            <div className="source-actions">
              {server.origin !== window.location.origin && (
                <button
                  type="button"
                  className="saved-server-switch"
                  aria-label={`切换到${server.name}`}
                  onClick={() => run(() => switchServer(server.origin))}
                >
                  切换服务器
                </button>
              )}
              <button
                className="secondary-button"
                type="button"
                aria-label={`编辑${server.name}`}
                onClick={() => {
                  setFormOpen(true);
                  setEditing(server.origin);
                  setName(server.name);
                  setAddress(server.origin);
                  setError("");
                }}
              >
                编辑
              </button>
              <button
                className="danger-subtle"
                type="button"
                aria-label={`删除${server.name}`}
                disabled={server.origin === window.location.origin}
                onClick={() =>
                  run(() => {
                    const latest = readServerPreferences();
                    saveServerPreferences({
                      servers: latest.servers.filter((item) => item.origin !== server.origin),
                      lastOrigin:
                        latest.lastOrigin === server.origin
                          ? window.location.origin
                          : latest.lastOrigin,
                    });
                    if (editing === server.origin) {
                      setEditing(null);
                      setName("");
                      setAddress("");
                    }
                  })
                }
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {formOpen && (
        <AppDialog title={editing ? "编辑服务器" : "添加服务器"} onClose={closeForm}>
          <form className="server-form" onSubmit={save}>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <label>
              服务器名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                placeholder="例如：家里 NAS"
              />
            </label>
            <label>
              服务器地址
              <input
                type="url"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                required
                readOnly={editing === window.location.origin}
                placeholder="http://192.168.1.10:3210"
              />
            </label>
            {!editing && (
              <p className="muted">
                连接后如需鉴权，将在目标服务器弹出登录窗口。账号密码仅用于目标服务器登录。
              </p>
            )}
            <div className="actions">
              {!editing && (
                <button type="submit" value="connect">
                  保存并连接
                </button>
              )}
              <button type="submit" className={editing ? undefined : "secondary-button"}>
                {editing ? "保存修改" : "保存服务器"}
              </button>
              <button type="button" className="secondary-button" onClick={closeForm}>
                取消
              </button>
            </div>
          </form>
        </AppDialog>
      )}
    </div>
  );
}
