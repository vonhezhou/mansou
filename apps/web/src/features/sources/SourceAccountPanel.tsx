import { useEffect, useRef, useState } from "react";
import { mansouApi } from "../../api/mansou.js";
import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { SourceAuth } from "../../types.js";

export function SourceAccountPanel({ sourceKey }: { sourceKey: string }) {
  const [auth, setAuth] = useState<SourceAuth | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<"password" | "cookies">("password");
  const controller = useRef<AbortController | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [operation, setOperation] = useState<"login" | "logout" | null>(null);
  const submitting = useRef(false);
  const busy = loading || operation !== null;
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setAuth(null);
    setError("");
    setUsername("");
    setPassword("");
    setCookies({});
    setOperation(null);
    submitting.current = false;
    if (sourceKey)
      mansouApi
        .getSourceAuth(sourceKey, request.signal)
        .then((value) => {
          if (active) {
            setAuth(value);
            setMethod(value.methods[0] ?? "password");
          }
        })
        .catch((error) => {
          if (active) setError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    else setLoading(false);
    return () => {
      active = false;
      request.abort();
    };
  }, [sourceKey, loadAttempt]);
  async function submit(logout = false) {
    if (!auth || loading || submitting.current) return;
    const request = controller.current;
    if (!request || request.signal.aborted) return;
    submitting.current = true;
    setOperation(logout ? "logout" : "login");
    setError("");
    try {
      const result = logout
        ? await mansouApi.logoutSource(sourceKey, request.signal)
        : await mansouApi.loginSource(
            sourceKey,
            method === "password"
              ? { method: "password", username, password }
              : {
                  method: "cookies",
                  values: auth.cookieFields.map((field) => cookies[field] ?? ""),
                },
            request.signal,
          );
      if (!request.signal.aborted) setAuth(result);
    } catch (error) {
      if (!request.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
        const current = await mansouApi.getSourceAuth(sourceKey, request.signal).catch(() => null);
        if (current && !request.signal.aborted) setAuth(current);
      }
    } finally {
      if (!request.signal.aborted) {
        submitting.current = false;
        setOperation(null);
        setPassword("");
        setCookies({});
      }
    }
  }
  return (
    <section className="source-panel source-account-panel">
      <h3>源账号</h3>
      {error && <p role="alert">{error}</p>}
      {!auth && !loading && error && (
        <button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>重试加载源账号</button>
      )}
      {loading && <LoadingStatus label="正在加载源账号状态…" />}
      {operation && (
        <LoadingStatus label={operation === "logout" ? "正在退出此源…" : "正在登录此源…"} />
      )}
      {auth ? (
        <>
          <p>{auth.loggedIn ? "已登录此源" : "未登录此源"}</p>
          {auth.quota && (
            <p role="status">
              今日已用 {auth.quota.used} / {auth.quota.limit} 次，剩余 {auth.quota.remaining} 次
            </p>
          )}
          {auth.methods.length > 1 && (
            <label>
              登录方式
              <select
                aria-label="登录方式"
                value={method}
                disabled={busy}
                onChange={(event) => {
                  setMethod(event.target.value as "password" | "cookies");
                  setPassword("");
                  setCookies({});
                }}
              >
                {auth.methods.map((value) => (
                  <option key={value} value={value}>
                    {value === "password" ? "账号密码" : "Cookie"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {auth.methods.length > 0 && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {method === "password" ? (
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
      ) : null}
    </section>
  );
}
