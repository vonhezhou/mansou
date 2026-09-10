import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runtimeCompatibility } from "../runtime/compatibility.js";
import { classifyPluginError } from "../runtime/errors.js";
import type { RouteContext } from "./types.js";

export async function registerDebugRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/debug/runtime/compatibility", async () => ({ items: runtimeCompatibility }));

  app.get("/debug/runtime/diagnostics", async () => context.runtime.diagnostics());

  app.get("/debug/:sourceKey/search", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const query = z
      .object({ keyword: z.string().default("test"), page: z.string().optional() })
      .parse(request.query);
    return debugRun(params.sourceKey, "search", () =>
      context.runtime.search(params.sourceKey, query.keyword, query.page),
    );
  });

  app.get("/debug/:sourceKey/comics/:comicId", async (request) => {
    const params = z.object({ sourceKey: z.string(), comicId: z.string() }).parse(request.params);
    return debugRun(params.sourceKey, "detail", () =>
      context.runtime.comicDetails(params.sourceKey, params.comicId),
    );
  });

  app.get("/debug/:sourceKey/comics/:comicId/episodes/:episodeId/pages", async (request) => {
    const params = z
      .object({ sourceKey: z.string(), comicId: z.string(), episodeId: z.string() })
      .parse(request.params);
    return debugRun(params.sourceKey, "pages", () =>
      context.runtime.comicPages(params.sourceKey, params.comicId, params.episodeId),
    );
  });

  app.get("/debug/:sourceKey/image", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const query = z
      .object({
        imageKey: z.string(),
        comicId: z.string().optional(),
        episodeId: z.string().optional(),
      })
      .parse(request.query);
    return debugRun(params.sourceKey, "image", async () => {
      const image = await context.imageProxy.loadBytes(
        { sourceKey: params.sourceKey, ...query },
        false,
      );
      return { contentType: image.contentType, bytes: image.data.length };
    });
  });
}

async function debugRun(sourceKey: string, operation: string, task: () => Promise<unknown>) {
  const startedAt = Date.now();
  try {
    const data = await task();
    return {
      ok: true,
      sourceKey,
      operation,
      durationMs: Date.now() - startedAt,
      summary: summarizeDebugData(data),
    };
  } catch (error) {
    const classified = classifyPluginError(error, sourceKey, operation);
    const cause = classified.cause instanceof Error ? classified.cause : error;
    return {
      ok: false,
      sourceKey,
      operation,
      durationMs: Date.now() - startedAt,
      error: {
        code: classified.code,
        message: classified.message,
        sourceKey: classified.sourceKey,
        operation: classified.operation,
        stack: cause instanceof Error ? cause.stack?.split("\n").slice(0, 6) : undefined,
      },
      hint: debugHint(classified),
    };
  }
}

function debugHint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("403"))
    return "The source rejected the request. Check cookies, referer/user-agent headers, Cloudflare, or no-proxy rules.";
  if (message.includes("302"))
    return "The source returned a redirect. Check whether the target domain should be added to VENERA_NO_PROXY or handled by a source fallback.";
  if (message.includes("fetch failed") || message.includes("aborted"))
    return "Network request failed. Check VENERA_PROXY, VENERA_NO_PROXY, and VENERA_REQUEST_TIMEOUT_MS.";
  if (message.includes("not defined") || message.includes("is not a function"))
    return "The plugin used a Venera JavaScript API that is not implemented in the Node runtime yet.";
  return undefined;
}

function summarizeDebugData(data: unknown): unknown {
  if (
    data &&
    typeof data === "object" &&
    "comics" in data &&
    Array.isArray((data as { comics: unknown[] }).comics)
  ) {
    const comics = (data as { comics: unknown[] }).comics;
    return { count: comics.length, first: comics[0] ?? null };
  }
  if (
    data &&
    typeof data === "object" &&
    "images" in data &&
    Array.isArray((data as { images: string[] }).images)
  ) {
    const images = (data as { images: string[] }).images;
    return { count: images.length, first: images[0] ?? null };
  }
  if (data && typeof data === "object" && "title" in data) {
    const details = data as {
      title?: string;
      chapters?: Record<string, string>;
      thumbnails?: string[];
    };
    return {
      title: details.title,
      chapterCount: Object.keys(details.chapters ?? {}).length,
      thumbnailCount: details.thumbnails?.length ?? 0,
    };
  }
  return data;
}
