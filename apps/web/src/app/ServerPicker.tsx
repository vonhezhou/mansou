import { useEffect, useState, type FormEvent } from "react";
import {
  normalizeServerOrigin,
  readServerPreferences,
  saveServerPreferences,
  serverLimit,
  subscribeServers,
  switchServer,
} from "../lib/servers.js";

export function ServerPicker({ manage = false }: { manage?: boolean }) {
  const [preferences, setPreferences] = useState(readServerPreferences);
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

  function save(event: FormEvent) {
    event.preventDefault();
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
      setEditing(null);
      setName("");
      setAddress("");
    });
  }

  return (
    <div className="server-picker">
      <label>
        当前服务器
        <select
          aria-label="切换服务器"
          value={window.location.origin}
          onChange={(event) => run(() => switchServer(event.target.value))}
        >
          {preferences.servers.map((server) => (
            <option key={server.origin} value={server.origin}>
              {server.name} · {server.origin}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {manage && (
        <>
          <p className="muted">
            名单保存在浏览器中，切换时打开目标服务器的漫搜页面。登录状态由各服务器分别保存。
          </p>
          <ul className="saved-servers">
            {preferences.servers.map((server) => (
              <li key={server.origin}>
                <div>
                  <strong>
                    {server.name}
                    {server.origin === window.location.origin ? "（当前）" : ""}
                  </strong>
                  <span>{server.origin}</span>
                </div>
                <div className="actions">
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`编辑${server.name}`}
                    onClick={() => {
                      setEditing(server.origin);
                      setName(server.name);
                      setAddress(server.origin);
                      setError("");
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="secondary-button"
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
              </li>
            ))}
          </ul>
          <form className="server-form" onSubmit={save}>
            <h3>{editing ? "编辑服务器" : "添加服务器"}</h3>
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
            <div className="actions">
              <button type="submit">{editing ? "保存修改" : "保存服务器"}</button>
              {editing && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                    setAddress("");
                    setError("");
                  }}
                >
                  取消编辑
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
