import { TokenPanel } from "./TokenPanel.js";
import { useState, type FormEvent } from "react";
import { authApi } from "../../api/auth.js";

export function AccountPanel({
  username,
  onSessionChange,
}: {
  username: string;
  onSessionChange: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
      await onSessionChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("两次新密码不一致");
      return;
    }
    void run(() => authApi.changePassword({ oldPassword, newPassword }));
  }
  return (
    <section className="panel account-panel">
      <span>管理员：{username}</span>{" "}
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? "收起账号设置" : "账号设置"}
      </button>{" "}
      <button disabled={busy} onClick={() => void run(authApi.logout)}>
        退出登录
      </button>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {expanded && <TokenPanel />}
      {expanded && (
        <form onSubmit={changePassword}>
          <h2>修改密码</h2>
          <label>
            当前密码
            <input
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              maxLength={128}
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <p>修改后所有设备需要重新登录，API Token 保持有效。</p>
          <button disabled={busy} type="submit">
            修改密码并重新登录
          </button>
        </form>
      )}
    </section>
  );
}
