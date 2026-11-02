import JSON5 from "json5";
import { withSourceScript, scriptCode, type RuntimeOptions } from "./script.js";
import { buildRequest, fetchHtml } from "./request.js";
import { SourceError, type BookSource } from "./types.js";
import { assertNoWebView } from "./sources.js";

export interface LoginField {
  name: string;
  label: string;
  type: "text" | "password";
}
export function loginFields(source: BookSource): LoginField[] {
  if (!source.loginUrl) return [];
  if (!source.loginUi)
    return [
      { name: "username", label: "账号", type: "text" },
      { name: "password", label: "密码", type: "password" },
    ];
  let rows: unknown;
  try {
    rows = JSON5.parse(source.loginUi);
  } catch {
    throw new SourceError("UNSUPPORTED_RULE", "登录表单当前需要静态 JSON 字段定义");
  }
  if (!Array.isArray(rows) || rows.length > 20)
    throw new SourceError("UNSUPPORTED_RULE", "登录字段应为不超过 20 项的数组");
  return rows
    .filter((row) => row?.type !== "button")
    .map((row) => {
      if (typeof row?.name !== "string" || !row.name || row.name.length > 100)
        throw new SourceError("UNSUPPORTED_RULE", "登录字段名称无效");
      return {
        name: row.name,
        label: String(row.label ?? row.name),
        type: /password/i.test(row.type ?? row.name) ? "password" : "text",
      };
    });
}

export async function loginSource(
  source: BookSource,
  values: Record<string, string>,
  options: RuntimeOptions & { fetcher?: typeof fetch } = {},
): Promise<{ authenticated: boolean }> {
  assertNoWebView(source);
  if (!source.loginUrl) throw new SourceError("UNSUPPORTED_RULE", "此书源没有配置登录请求");
  const loginUrl = source.loginUrl;
  return withSourceScript(
    source,
    { ...options, bindings: { ...values, loginInfo: values } },
    async (script) => {
      script.setBindings({ ...values, loginInfo: values });
      const code =
        scriptCode(loginUrl) ?? (!/^(?:https?:\/\/|\/)/i.test(loginUrl) ? loginUrl : undefined);
      if (code !== undefined) {
        if (!/\bfunction\s+login\s*\(/.test(code)) script.evaluate(code, {}, false);
        const result = script.evaluate("typeof login === 'function' ? login() : undefined");
        if (result === false) throw new SourceError("SOURCE_ERROR", "书源登录未通过");
        const state = script.state;
        if (
          result !== true &&
          !Object.keys(state.loginHeaders).length &&
          !state.cookies?.cookies.length &&
          !Object.keys(state.data).length
        )
          throw new SourceError("SOURCE_ERROR", "登录脚本没有建立会话，请检查书源规则");
      } else {
        const url = /,\s*\{/.test(loginUrl)
          ? loginUrl
          : `${loginUrl},${JSON.stringify({
              method: "POST",
              body: Object.entries(values)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join("&"),
            })}`;
        const request = buildRequest({ ...source, searchUrl: url }, "", 1, script);
        await fetchHtml(
          request,
          options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 8000),
          undefined,
          options.fetcher,
          script,
        );
        if (!script.state.cookies?.cookies.length && !Object.keys(script.state.loginHeaders).length)
          throw new SourceError("SOURCE_ERROR", "登录响应未建立 Cookie 或令牌会话");
      }
      return { authenticated: true };
    },
  );
}
