type CookieImportPanelProps = {
  busy: boolean;
  sourceKey: string;
  cookieUrl: string;
  cookieText: string;
  onCookieUrlChange: (value: string) => void;
  onCookieTextChange: (value: string) => void;
  onImportCookies: () => void;
  onClearCookies: () => void;
};

export function CookieImportPanel(props: CookieImportPanelProps) {
  return (
    <section className="source-panel">
      <h3>Cookie：{props.sourceKey || "未选择"}</h3>
      <p className="muted">Cookie 将导入当前操作源，仅影响该源的请求。</p>
      <div className="settings-grid">
        <label>
          Cookie URL
          <input
            value={props.cookieUrl}
            onChange={(event) => props.onCookieUrlChange(event.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <label>
          Cookie 每行一条
          <textarea
            value={props.cookieText}
            onChange={(event) => props.onCookieTextChange(event.target.value)}
            placeholder="name=value; Domain=..."
          />
        </label>
        <div className="actions">
          <button
            onClick={props.onImportCookies}
            disabled={props.busy || !props.sourceKey || !props.cookieUrl || !props.cookieText}
          >
            导入 Cookie
          </button>
          <button
            className="danger"
            onClick={props.onClearCookies}
            disabled={props.busy || !props.sourceKey}
          >
            清空 Cookie
          </button>
        </div>
      </div>
    </section>
  );
}
