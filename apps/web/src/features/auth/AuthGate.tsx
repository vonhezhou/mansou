import { LoadingStatus } from "../../app/LoadingStatus.js";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { authApi, type AuthSession } from "../../api/auth.js";
import { setCsrfToken } from "../../api/client.js";
import { ServerPicker } from "../../app/ServerPicker.js";
import { AppDialog } from "../../app/AppDialog.js";

export function AuthGate({
  children,
}: {
  children: (session: AuthSession, reload: () => Promise<void>) => ReactNode;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [loginOpen, setLoginOpen] = useState(true);
  function accept(next: AuthSession) {
    setCsrfToken(next.csrfToken ?? "");
    setSession(next);
    if (next.mode === "required" && !next.authenticated) setLoginOpen(true);
  }
  async function reload() {
    setConnecting(true);
    try {
      accept(await authApi.session());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }
  useEffect(() => {
    // Remove the old shared credential; new sessions are HttpOnly cookies.
    try {
      window.localStorage.removeItem("mansou_access_token");
    } catch {
      /* storage may be disabled */
    }
    void reload();
    const expired = () => {
      setCsrfToken("");
      setSession((previous) =>
        previous ? { ...previous, authenticated: false, csrfToken: undefined } : null,
      );
      void reload();
    };
    window.addEventListener("mansou:unauthorized", expired);
    return () => window.removeEventListener("mansou:unauthorized", expired);
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      accept(await authApi.login({ username, password }));
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  if (session && (session.mode === "none" || session.authenticated))
    return children(session, reload);
  return (
    <main className="shell">
      <section className="panel auth-panel">
        <h1>登录漫搜</h1>
        {error && !(session?.initialized && loginOpen) && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {!session ? (
          <>
            {connecting && <LoadingStatus label="正在连接服务…" />}
            <button disabled={connecting} onClick={() => void reload()}>
              重试
            </button>
          </>
        ) : !session.initialized ? (
          <p>管理员尚未初始化，请联系服务器管理员完成账号设置。</p>
        ) : (
          <>
            <p>当前服务器需要登录后才能使用。</p>
            <button type="button" onClick={() => setLoginOpen(true)}>
              登录服务器
            </button>
          </>
        )}
        {session?.initialized && loginOpen && (
          <AppDialog
            title="登录服务器"
            onClose={() => {
              setLoginOpen(false);
              setPassword("");
            }}
          >
            <form onSubmit={login}>
              <p className="muted">{window.location.origin}</p>
              {error && (
                <p role="alert" className="alert">
                  {error}
                </p>
              )}
              <label>
                用户名
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  maxLength={64}
                />
              </label>
              <label>
                密码
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  maxLength={128}
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? <LoadingStatus label="正在登录…" /> : "登录"}
              </button>
            </form>
          </AppDialog>
        )}
        <details className="auth-servers">
          <summary>管理与切换服务器</summary>
          <ServerPicker />
        </details>
      </section>
    </main>
  );
}
