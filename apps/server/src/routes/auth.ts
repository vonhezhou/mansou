import { registerAuthContract } from "../auth/contract.js";
import { randomUUID } from "node:crypto";
import { randomSecret, secretHash } from "../auth/password.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import { requireOrigin, requireSession, setSessionCookie } from "../auth/http.js";
import { ApiError } from "./errors.js";

export async function registerAuthRoutes(app: FastifyInstance, auth: AuthService) {
  registerAuthContract(app);
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
  app.get("/auth/tokens", async (request) => {
    enabled();
    requireSession(request);
    return auth.storage.auth.tokens();
  });
  app.post("/auth/tokens", { bodyLimit: 4096 }, async (request) => {
    enabled();
    requireSession(request);
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        expiresAt: z.number().int().positive().max(8640000000000000).nullable().optional(),
      })
      .strict()
      .parse(request.body);
    if (body.expiresAt != null && body.expiresAt <= Date.now())
      throw new ApiError(400, "VALIDATION_ERROR", "有效期必须晚于当前时间");
    const entry = {
      id: randomUUID(),
      name: body.name,
      createdAt: Date.now(),
      expiresAt: body.expiresAt ?? null,
    };
    const token = `venera_${randomSecret()}`;
    auth.storage.auth.createToken(entry, secretHash(token));
    return { token, entry };
  });
  app.delete("/auth/tokens/:id", async (request) => {
    enabled();
    requireSession(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!auth.storage.auth.deleteToken(id))
      throw new ApiError(404, "TOKEN_NOT_FOUND", "Token 不存在");
    return { ok: true };
  });
}
