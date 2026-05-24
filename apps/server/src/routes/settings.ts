import type { FastifyInstance } from "fastify";
import type { RouteContext } from "./types.js";

export async function registerSettingRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/settings/cache", async () => context.imageProxy.cacheStats());
  app.post("/settings/cache/images/prune", async () => context.imageProxy.enforceCacheLimit());
  app.delete("/settings/cache/images", async () => context.imageProxy.clearCache());
}
