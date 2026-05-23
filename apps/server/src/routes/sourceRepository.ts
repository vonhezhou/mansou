import type { FastifyInstance } from "fastify";
import { config } from "../config/config.js";
import type { RouteContext } from "./types.js";

export async function registerSourceRepositoryRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/source-repository", async () => ({
    url: config.sourceListUrl,
    sources: await context.repository.getAvailableSources(),
  }));

  app.post("/source-repository/refresh", async () => ({
    sources: await context.repository.refreshRepository(),
  }));
}
