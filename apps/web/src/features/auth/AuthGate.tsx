import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { authApi, type AuthSession } from "../../api/auth.js";
import { setCsrfToken } from "../../api/client.js";

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
  function accept(next: AuthSession) {
    setCsrfToken(next.csrfToken ?? "");
    setSession(next);
  }
  async function reload() {
    try {
      accept(await authApi.session());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  useEffect(() => {
    // Remove the old shared credential; new sessions are HttpOnly cookies.
    try {
      window.localStorage.removeItem("venera_access_token");
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
    window.addEventListener("venera:unauthorized", expired);
    return () => window.removeEventListener("venera:unauthorized", expired);
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
        <h1>登录 Venera</h1>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {!session ? (
          <>
            <p>正在连接服务…</p>
            <button onClick={() => void reload()}>重试</button>
          </>
        ) : !session.initialized ? (
          <p>管理员尚未初始化，请联系服务器管理员完成账号设置。</p>
        ) : (
          <form onSubmit={login}>
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
              {busy ? "正在登录…" : "登录"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
