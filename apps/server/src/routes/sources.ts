import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerSourceRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/sources/available", async () => context.repository.getAvailableSources());
  app.get("/sources/installed", async () => context.runtime.all());
  app.get("/sources", async () => context.runtime.all());

  app.post("/sources/install", async (request) => {
    const body = z.object({ source: z.string().min(1) }).parse(request.body);
    const installed = await context.repository.installSource(body.source);
    const loaded = await context.runtime.loadScript(installed.filePath);
    return { installed, loaded: { key: loaded.key, name: loaded.name, version: loaded.version } };
  });

  app.post("/sources/reload", async () => ({ loaded: await context.runtime.loadInstalled() }));

  app.get("/sources/:sourceKey", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.runtime.all().find((source) => source.key === params.sourceKey) ?? null;
  });

  app.get("/sources/:sourceKey/search-options", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.runtime.searchOptions(params.sourceKey);
  });

  app.get("/sources/:sourceKey/cookies", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.runtime.cookies(params.sourceKey);
  });

  app.put("/sources/:sourceKey/cookies", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z
      .object({ url: z.string().url(), cookies: z.array(z.union([z.string(), z.record(z.unknown())])) })
      .parse(request.body);
    return context.runtime.importCookies(params.sourceKey, body.url, body.cookies);
  });

  app.delete("/sources/:sourceKey/cookies", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    await context.runtime.clearCookies(params.sourceKey);
    return { ok: true };
  });

  app.get("/sources/:sourceKey/settings", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.runtime.sourceSettings(params.sourceKey);
  });

  app.put("/sources/:sourceKey/settings", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z.object({ values: z.record(z.unknown()) }).parse(request.body);
    return context.runtime.updateSourceSettings(params.sourceKey, body.values);
  });

  app.delete("/sources/:sourceKey/settings", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.runtime.clearSourceSettings(params.sourceKey);
  });
}
