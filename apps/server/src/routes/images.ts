import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerImageRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "imageProxy">,
) {
  app.get("/image", async (request, reply) => {
    const query = z
      .object({
        sourceKey: z.string(),
        imageKey: z.string(),
        comicId: z.string().optional(),
        episodeId: z.string().optional(),
        thumbnail: z.coerce.boolean().optional(),
      })
      .parse(request.query);
    const image = await context.imageProxy.load(query);
    reply.header("content-type", image.contentType);
    reply.header("cache-control", "public, max-age=86400");
    return reply.send(image.data);
  });
}
