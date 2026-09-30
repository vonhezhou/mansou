import { registerAuthContract } from "../auth/contract.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import { requireOrigin, requireSession, setSessionCookie } from "../auth/http.js";
import { AppError } from "../errors.js";

export async function registerAuthRoutes(app: FastifyInstance, auth: AuthService) {
  registerAuthContract(app);
  const enabled = () => {
    if (auth.config.mode !== "required") throw new AppError("AUTH_DISABLED", "当前未启用鉴权");
  };
  app.get("/auth/session", async (request) => auth.sessionInfo(request.identity));
  app.post("/auth/login", { bodyLimit: 4096 }, async (request, reply) => {
    enabled();
    requireOrigin(request, auth);
    const body = z
      .object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) })
      .strict()
      .parse(request.body);
    const { secret, session } = await auth.login(request.ip, body.username, body.password);
    if (request.identity?.kind === "session") auth.logout(request.identity.session);
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
    auth.logout(requireSession(request));
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
    return auth.tokens();
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
    return auth.createToken(body.name, body.expiresAt);
  });
  app.delete("/auth/tokens/:id", async (request) => {
    enabled();
    requireSession(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    auth.deleteToken(id);
    return { ok: true };
  });
}
