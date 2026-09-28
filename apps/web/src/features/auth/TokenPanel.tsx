import { useEffect, useState, type FormEvent } from "react";
import { authApi, type ApiToken } from "../../api/auth.js";

export function TokenPanel() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refresh().catch(fail);
  }, []);
  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : String(err));
  }
  async function refresh() {
    setTokens(await authApi.tokens());
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authApi.createToken({
        name,
        expiresAt: days ? Date.now() + Number(days) * 86400000 : null,
      });
      setSecret(result.token);
      setName("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(token: ApiToken) {
    if (!window.confirm(`撤销“${token.name}”后，使用它的客户端将无法继续访问。确定撤销？`)) return;
    setBusy(true);
    setError("");
    try {
      await authApi.revokeToken(token.id);
      setSecret("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>客户端 API Token</h2>
      <p>用于外部客户端访问业务接口，不能管理账号和其他 Token。</p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {secret && (
        <div role="status">
          <p>请立即保存，关闭后无法再次查看。</p>
          <label>
            新 Token
            <input
              aria-label="新 Token"
              readOnly
              value={secret}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button onClick={() => setSecret("")}>已保存，关闭</button>
        </div>
      )}
      <form onSubmit={create}>
        <label>
          客户端名称
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <label>
          有效期
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">30 天</option>
            <option value="90">90 天</option>
            <option value="">不过期</option>
          </select>
        </label>
        <button type="submit" disabled={busy || !!secret}>
          创建 Token
        </button>
      </form>
      <ul>
        {tokens.map((token) => (
          <li key={token.id}>
            <strong>{token.name}</strong> ·{" "}
            {token.expiresAt
              ? `${token.expiresAt <= Date.now() ? "已过期" : "到期"}：${new Date(token.expiresAt).toLocaleString()}`
              : "不过期"}{" "}
            <button disabled={busy} onClick={() => void revoke(token)}>
              撤销
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
