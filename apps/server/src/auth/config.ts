export type AuthConfig = {
  mode: "none" | "required";
  origin: string;
  secureCookie: boolean;
  sessionTtlSeconds: number;
};

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  if (env.VENERA_ACCESS_TOKEN) {
    throw new Error(
      "VENERA_ACCESS_TOKEN 已停用。请移除旧配置，设置 AUTH_MODE 并运行 admin init；详见 doc/auth.md。",
    );
  }
  const mode = env.AUTH_MODE ?? "none";
  if (mode !== "none" && mode !== "required") throw new Error("AUTH_MODE 必须为 none 或 required");
  const origin = env.AUTH_ORIGIN ?? "";
  if (mode === "required") {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("required 模式必须设置 AUTH_ORIGIN，例如 https://venera.example.com");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("AUTH_ORIGIN 必须是完整的 HTTP(S) origin，不含路径、凭据或末尾斜线");
    }
  }
  const ttl = Number(env.AUTH_SESSION_TTL_SECONDS ?? 86400);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 2592000)
    throw new Error("会话有效期必须为 60 至 2592000 秒");
  return { mode, origin, secureCookie: origin.startsWith("https:"), sessionTtlSeconds: ttl };
}
