import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { RouteContext } from "./types.js";

export async function registerSettingRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "imageProxy" | "downloadDirectory">,
) {
  app.get("/settings/downloads", async () => context.downloadDirectory.settings());
  app.put("/settings/downloads", async (request) => {
    const body = z
      .object({
        publicDir: z.string().trim().min(1).max(4096),
        personalDir: z.string().trim().min(1).max(4096),
        defaultDestination: z.enum(["public", "personal"]),
      })
      .strict()
      .parse(request.body);
    return context.downloadDirectory.save(body);
  });
  app.get("/settings/cache", async () => context.imageProxy.cacheStats());
  app.post("/settings/cache/images/prune", async () => context.imageProxy.enforceCacheLimit());
  app.delete("/settings/cache/images", async () => context.imageProxy.clearCache());
}
