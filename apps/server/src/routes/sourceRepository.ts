import type { FastifyInstance } from "fastify";
import type { RouteContext } from "./types.js";

export async function registerSourceRepositoryRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "repository">,
) {
  app.get("/source-repository", async () => ({
    url: context.repository.url,
    sources: await context.repository.getAvailableSources(),
  }));

  app.post("/source-repository/refresh", async () => ({
    sources: await context.repository.refreshRepository(),
  }));
}
