import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import { requireOrigin, requireSession, setSessionCookie } from "../auth/http.js";
import { ApiError } from "./errors.js";

export async function registerAuthRoutes(app: FastifyInstance, auth: AuthService) {
  const enabled = () => {
    if (auth.config.mode !== "required") throw new ApiError(404, "AUTH_DISABLED", "当前未启用鉴权");
  };
  app.get("/auth/session", async (request) => {
    const session = request.identity?.kind === "session" ? request.identity.session : undefined;
    return {
      mode: auth.config.mode,
      authenticated: !!session,
      initialized: !!auth.storage.auth.admin(),
      ...(session
        ? {
            username: auth.storage.auth.admin()!.username,
            csrfToken: session.csrfToken,
            expiresAt: session.expiresAt,
          }
        : {}),
    };
  });
  app.post("/auth/login", { bodyLimit: 4096 }, async (request, reply) => {
    enabled();
    requireOrigin(request, auth);
    const body = z
      .object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) })
      .strict()
      .parse(request.body);
    const { secret, session } = await auth.login(request.ip, body.username, body.password);
    if (request.identity?.kind === "session")
      auth.storage.auth.deleteSession(request.identity.session.hash);
    setSessionCookie(reply, auth, secret);
    return {
      mode: auth.config.mode,
      authenticated: true,
      initialized: true,
      username: body.username,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    };
  });
  app.post("/auth/logout", async (request, reply) => {
    enabled();
    auth.storage.auth.deleteSession(requireSession(request).hash);
    setSessionCookie(reply, auth, "");
    return { ok: true };
  });
  app.put("/auth/password", { bodyLimit: 4096 }, async (request, reply) => {
    enabled();
    const session = requireSession(request);
    const body = z
      .object({ oldPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) })
      .strict()
      .parse(request.body);
    await auth.changePassword(request.ip, body.oldPassword, body.newPassword, session);
    setSessionCookie(reply, auth, "");
    return { ok: true };
  });
}
