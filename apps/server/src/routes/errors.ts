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
  if (code === "DOWNLOAD_BUSY" || code === "DOWNLOAD_NOT_COMPLETED") return 409;
  if (code === "APP_CLOSING") return 503;
  return 500;
}
