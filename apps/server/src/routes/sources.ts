import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LoadedSource } from "../types/source.js";
import type { RouteContext } from "./types.js";

export async function registerSourceRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/sources/available", async () => context.repository.getAvailableSources());
  app.get("/sources/metadata", async () =>
    context.repository.withAvailableUpdates(
      context.storage.listSources() as Array<{ key: string; version?: string }>,
    ),
  );
  app.get("/sources/installed", async () => context.runtime.all());
  app.get("/sources", async () => context.runtime.all());

  app.post("/sources/install", async (request) => {
    const body = z.object({ source: z.string().min(1) }).parse(request.body);
    let loaded!: LoadedSource;
    const installed = await context.repository.installSource(body.source, async (filePath) => {
      loaded = await context.runtime.loadScript(filePath);
    });
    context.storage.upsertSource({
      key: loaded.key,
      name: loaded.name,
      version: loaded.version,
      scriptPath: installed.filePath,
      scriptUrl: installed.scriptUrl,
      hash: installed.hash,
      enabled: true,
    });
    const metadata = context.storage.getSource(loaded.key) as { enabled?: number } | null;
    if (metadata?.enabled === 0) await context.runtime.loadInstalled();
    return { installed, loaded: { key: loaded.key, name: loaded.name, version: loaded.version } };
  });

  app.post("/sources/reload", async () => ({ loaded: await context.runtime.loadInstalled() }));

  app.get("/sources/:sourceKey", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    return context.runtime.all().find((source) => source.key === params.sourceKey) ?? null;
  });

  app.put("/sources/:sourceKey/enabled", async (request, reply) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    const source = context.storage.setSourceEnabled(params.sourceKey, body.enabled);
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
    await context.runtime.loadInstalled();
    return source;
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
      .object({
        url: z.string().url(),
        cookies: z.array(z.union([z.string(), z.record(z.unknown())])).optional(),
        text: z.string().optional(),
      })
      .parse(request.body);
    return context.runtime.importCookies(
      params.sourceKey,
      body.url,
      body.text ?? body.cookies ?? [],
    );
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
