import { useEffect, useRef, useState } from "react";
import { AppDialog } from "../../app/AppDialog.js";
import { novelApi, type NovelAccount } from "../../api/novels.js";

export function NovelAccountDialog({
  source,
  onClose,
}: {
  source: { id: string; name: string };
  onClose: () => void;
}) {
  const [account, setAccount] = useState<NovelAccount>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const submitting = useRef(false);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    void novelApi.account(source.id, request.signal).then(
      (value) => {
        if (!request.signal.aborted) setAccount(value);
      },
      (reason) => {
        if (!request.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => request.abort();
  }, [source.id]);
  async function submit(logout = false) {
    const request = controller.current;
    if (!request || submitting.current || !account) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = logout
        ? await novelApi.logout(source.id, request.signal)
        : await novelApi.login(source.id, values, request.signal);
      if (!request.signal.aborted) setAccount(result);
    } catch (reason) {
      if (!request.signal.aborted)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      submitting.current = false;
      if (!request.signal.aborted) {
        setValues({});
        setBusy(false);
      }
    }
  }
  return (
    <AppDialog title={`书源账号：${source.name}`} onClose={onClose}>
      {error && <p role="alert">{error}</p>}
      {!account && !error && <p role="status">正在加载账号状态…</p>}
      {account && (
        <>
          <p role="status">{account.loggedIn ? "已登录此书源" : "未登录此书源"}</p>
          {account.loginSupported ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {account.fields.map((field) => (
                <label key={field.name}>
                  {field.label}
                  <input
                    name={field.name}
                    type={field.type}
                    required
                    disabled={busy}
                    autoComplete={field.type === "password" ? "current-password" : "username"}
                    value={values[field.name] ?? ""}
                    onChange={(event) =>
                      setValues((old) => ({ ...old, [field.name]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <div className="source-actions">
                <button disabled={busy} type="submit">
                  {busy ? "正在处理…" : "登录书源"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  退出并清除会话
                </button>
              </div>
            </form>
          ) : (
            <>
              <p>此书源未配置 HTTP 登录。</p>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void submit(true)}
              >
                清除会话
              </button>
            </>
          )}
        </>
      )}
    </AppDialog>
  );
}
