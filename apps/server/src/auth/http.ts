import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { parseCookie, stringifySetCookie } from "cookie";
import { ApiError } from "../routes/errors.js";
import { secretHash } from "./password.js";
import { AuthService, type Identity } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    identity: Identity | null;
  }
}
const safe = new Set(["GET", "HEAD", "OPTIONS"]);
const publicPaths = new Set([
  "/",
  "/app.js",
  "/style.css",
  "/health",
  "/api/v1/health",
  "/api/v1/auth/session",
  "/api/v1/auth/login",
]);
export const sessionCookie = (auth: AuthService) =>
  auth.config.secureCookie ? "__Host-venera_session" : "venera_session";

export function setSessionCookie(reply: FastifyReply, auth: AuthService, secret: string) {
  reply.header(
    "set-cookie",
    stringifySetCookie({
      name: sessionCookie(auth),
      value: secret,
      httpOnly: true,
      secure: auth.config.secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: secret ? auth.config.sessionTtlSeconds : 0,
    }),
  );
}
export function requireOrigin(request: FastifyRequest, auth: AuthService) {
  if (request.headers.origin !== auth.config.origin)
    throw new ApiError(403, "CSRF_REJECTED", "请求来源不被允许");
}
export function requireSession(request: FastifyRequest) {
  if (request.identity?.kind !== "session")
    throw new ApiError(403, "SESSION_REQUIRED", "此操作需要管理员浏览器会话");
  return request.identity.session;
}
export function registerAuthHook(app: FastifyInstance, auth: AuthService) {
  app.decorateRequest("identity", null);
  app.addHook("onRequest", async (request, reply) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) reply.header("cache-control", "no-store");
    if (auth.config.mode === "none") {
      request.identity = { kind: "none" };
      return;
    }
    const authorization = request.headers.authorization;
    if (authorization) {
      const hash = secretHash(authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
      if (auth.storage.auth.token(hash)) request.identity = { kind: "token", hash };
    } else {
      const value = parseCookie(request.headers.cookie ?? "")[sessionCookie(auth)];
      const session = value ? auth.storage.auth.session(secretHash(value)) : undefined;
      if (session) request.identity = { kind: "session", session };
    }
    if (publicPaths.has(pathname) || pathname.startsWith("/assets/")) return;
    if (!request.identity) throw new ApiError(401, "UNAUTHORIZED", "请先登录");
    if (request.identity.kind === "session" && !safe.has(request.method)) {
      requireOrigin(request, auth);
      if (request.headers["x-csrf-token"] !== request.identity.session.csrfToken)
        throw new ApiError(403, "CSRF_REJECTED", "请求校验失败，请刷新页面");
    }
  });
  const cleanup = setInterval(() => auth.storage.auth.pruneSessions(), 60000);
  cleanup.unref();
  app.addHook("onClose", async () => clearInterval(cleanup));
}
