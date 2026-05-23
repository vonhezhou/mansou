import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerComicRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/comics/:sourceKey/:comicId", async (request) => {
    const params = z.object({ sourceKey: z.string(), comicId: z.string() }).parse(request.params);
    return context.runtime.comicDetails(params.sourceKey, params.comicId);
  });

  app.get("/comics/:sourceKey/:comicId/episodes/:episodeId/pages", async (request) => {
    const params = z.object({ sourceKey: z.string(), comicId: z.string(), episodeId: z.string() }).parse(request.params);
    return context.runtime.comicPages(params.sourceKey, params.comicId, params.episodeId);
  });
}
