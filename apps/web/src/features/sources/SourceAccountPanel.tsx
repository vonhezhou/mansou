import { useEffect, useState } from "react";
import { veneraApi } from "../../api/venera.js";
import type { SourceAuth } from "../../types.js";

export function SourceAccountPanel({ sourceKey }: { sourceKey: string }) {
  const [auth, setAuth] = useState<SourceAuth | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (sourceKey)
      veneraApi
        .getSourceAuth(sourceKey)
        .then((value) => {
          if (active) setAuth(value);
        })
        .catch((error) => {
          if (active) setError(String(error));
        });
    return () => {
      active = false;
    };
  }, [sourceKey]);
  async function submit(logout = false) {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      setAuth(
        logout
          ? await veneraApi.logoutSource(sourceKey)
          : await veneraApi.loginSource(
              sourceKey,
              auth.methods.includes("password")
                ? { method: "password", username, password }
                : {
                    method: "cookies",
                    values: auth.cookieFields.map((field) => cookies[field] ?? ""),
                  },
            ),
      );
      setPassword("");
      setCookies({});
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="source-panel">
      <h3>源账号</h3>
      {error && <p role="alert">{error}</p>}
      {auth ? (
        <>
          <p>{auth.loggedIn ? "已登录此源" : "未登录此源"}</p>
          {auth.methods.length > 0 && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {auth.methods.includes("password") ? (
                <>
                  <label>
                    源账号
                    <input
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label>
                    源密码
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                </>
              ) : (
                auth.cookieFields.map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      type="password"
                      value={cookies[field] ?? ""}
                      onChange={(event) => setCookies({ ...cookies, [field]: event.target.value })}
                      disabled={busy}
                    />
                  </label>
                ))
              )}
              <button disabled={busy}>登录此源</button>
            </form>
          )}
          {auth.loggedIn && (
            <button disabled={busy} onClick={() => void submit(true)}>
              退出此源
            </button>
          )}
          {!auth.methods.length && (
            <p className="muted">此源没有可用的账号密码或 Cookie 登录方式。</p>
          )}
          {auth.webview === "unsupported" && (
            <p className="muted">此源支持网页登录，当前服务尚不支持该流程。</p>
          )}
        </>
      ) : (
        !error && <p className="muted">正在加载源账号状态…</p>
      )}
    </section>
  );
}
