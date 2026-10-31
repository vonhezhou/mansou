import { AppError } from "../errors.js";
export function notFound(code: string, message: string) {
  return new AppError(code, message);
}
export function applicationStatus(code: string) {
  if (code.endsWith("_NOT_FOUND") || code === "AUTH_DISABLED") return 404;
  if (code === "AUTH_RATE_LIMITED") return 429;
  if (code === "INVALID_CREDENTIALS" || code === "UNAUTHORIZED") return 401;
  if (code === "CSRF_REJECTED" || code === "SESSION_REQUIRED") return 403;
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "DOWNLOAD_BUSY" || code === "DOWNLOAD_NOT_COMPLETED" || code === "SOURCE_BUILTIN")
    return 409;
  if (code === "APP_CLOSING") return 503;
  return 500;
}

export function publicPluginErrorMessage(code: string) {
  const messages: Record<string, string> = {
    SOURCE_NOT_LOADED: "漫画源尚未启用或加载失败，请在源管理中启用后重试。",
    PLUGIN_TIMEOUT: "漫画源响应超时，请稍后重试或更换漫画源。",
    PLUGIN_NETWORK_ERROR: "无法连接漫画源，请检查网络或代理设置，或更换漫画源。",
    PLUGIN_RATE_LIMITED: "漫画源限制了请求频率，请稍后重试。",
    IMAGE_REJECTED: "漫画源拒绝了请求，或内容不可用。请检查 Cookie、稍后重试或更换漫画源。",
    PLUGIN_API_MISSING: "此漫画源使用了暂不支持的功能，请更新或更换漫画源。",
    PLUGIN_SOURCE_ERROR: "漫画源执行失败，请稍后重试、更新或更换漫画源。",
  };
  return messages[code] ?? "漫画源暂时不可用，请稍后重试或更换漫画源。";
}
