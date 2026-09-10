import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerLibraryRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/library/history", async () => context.storage.listHistory());

  app.get("/library/history/:sourceKey/:comicId", async (request) => {
    const params = z.object({ sourceKey: z.string(), comicId: z.string() }).parse(request.params);
    return context.storage.getHistory(params.sourceKey, params.comicId);
  });

  app.put("/library/history/:sourceKey/:comicId", async (request) => {
    const params = z.object({ sourceKey: z.string(), comicId: z.string() }).parse(request.params);
    const body = z
      .object({
        title: z.string().optional(),
        cover: z.string().optional(),
        episodeId: z.string().optional(),
        page: z.number().optional(),
        progress: z.number().optional(),
      })
      .parse(request.body);
    return context.storage.saveHistory({ ...params, ...body });
  });
}
