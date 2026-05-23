import type { FastifyInstance } from "fastify";

export async function registerOpenApiRoutes(app: FastifyInstance) {
  app.get("/openapi.json", async () => ({
    openapi: "3.1.0",
    info: { title: "Venera Web API", version: "0.1.0" },
    paths: {
      "/api/v1/health": { get: { summary: "Health check" } },
      "/api/v1/sources": { get: { summary: "List installed sources" } },
      "/api/v1/search": { get: { summary: "Aggregated search" } },
      "/api/v1/search/{sourceKey}": { get: { summary: "Search one source" } },
      "/api/v1/comics/{sourceKey}/{comicId}": { get: { summary: "Load comic details" } },
      "/api/v1/comics/{sourceKey}/{comicId}/episodes/{episodeId}/pages": { get: { summary: "Load episode pages" } },
      "/api/v1/image": { get: { summary: "Proxy image bytes" } },
      "/api/v1/downloads": { get: { summary: "List downloads" }, post: { summary: "Create download" } },
    },
  }));
}
