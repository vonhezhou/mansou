import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerSourceRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "repository" | "sources">,
) {
  app.get("/sources/available", async () => context.repository.getAvailableSources());
  app.get("/sources/metadata", async () => context.sources.metadata());
  app.get("/sources/installed", async () => context.sources.all());
  app.get("/sources", async () => context.sources.all());

  app.post("/sources/install", async (request) => {
    const body = z.object({ source: z.string().min(1) }).parse(request.body);
    return context.sources.install(body.source);
  });

  app.post("/sources/reload", async () => ({ loaded: await context.sources.loadInstalled() }));

  app.get("/sources/:sourceKey", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.all().find((source) => source.key === params.sourceKey) ?? null;
  });

  app.delete("/sources/:sourceKey", async (request) => {
    const params = z.object({ sourceKey: z.string().min(1) }).parse(request.params);
    return context.sources.uninstall(params.sourceKey);
  });

  app.put("/sources/:sourceKey/enabled", async (request, reply) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    const source = await context.sources.setEnabled(params.sourceKey, body.enabled);
    if (!source) {
      reply.code(404);
      return {
        error: {
          code: "SOURCE_NOT_FOUND",
          message: "Source metadata not found",
          requestId: request.id,
        },
      };
    }
    return source;
  });

  app.get("/sources/:sourceKey/search-options", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.searchOptions(params.sourceKey);
  });

  app.get("/sources/:sourceKey/cookies", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.cookies(params.sourceKey);
  });

  app.put("/sources/:sourceKey/cookies", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z
      .object({
        url: z.string().url(),
        cookies: z.array(z.union([z.string(), z.record(z.unknown())])).optional(),
        text: z.string().optional(),
      })
      .parse(request.body);
    return context.sources.importCookies(
      params.sourceKey,
      body.url,
      body.text ?? body.cookies ?? [],
    );
  });

  app.delete("/sources/:sourceKey/cookies", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    await context.sources.clearCookies(params.sourceKey);
    return { ok: true };
  });

  app.get("/sources/:sourceKey/settings", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.sourceSettings(params.sourceKey);
  });

  app.put("/sources/:sourceKey/settings", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z.object({ values: z.record(z.unknown()) }).parse(request.body);
    return context.sources.updateSourceSettings(params.sourceKey, body.values);
  });

  app.delete("/sources/:sourceKey/settings", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.clearSourceSettings(params.sourceKey);
  });
  app.post("/sources/:sourceKey/settings/:settingKey/invoke", async (request) => {
    const params = z
      .object({ sourceKey: z.string(), settingKey: z.string() })
      .parse(request.params);
    return context.sources.invokeSetting(params.sourceKey, params.settingKey);
  });
  app.get("/sources/:sourceKey/auth", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.auth(params.sourceKey);
  });
  app.post("/sources/:sourceKey/auth/login", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z
      .discriminatedUnion("method", [
        z.object({
          method: z.literal("password"),
          username: z.string().min(1),
          password: z.string().min(1),
        }),
        z.object({ method: z.literal("cookies"), values: z.array(z.string()) }),
      ])
      .parse(request.body);
    return context.sources.login(params.sourceKey, body);
  });
  app.post("/sources/:sourceKey/auth/logout", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.sources.logout(params.sourceKey);
  });
}
