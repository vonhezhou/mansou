import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerSearchRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "search">,
) {
  app.get("/search", async (request) => {
    const query = z
      .object({ keyword: z.string().min(1), sources: z.string().optional() })
      .parse(request.query);
    return context.search.aggregatedSearch(
      query.keyword,
      query.sources
        ?.split(",")
        .map((source) => source.trim())
        .filter(Boolean),
    );
  });

  app.get("/search/:sourceKey", async (request) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const query = z
      .object({
        keyword: z.string().min(1),
        page: z.string().optional(),
        next: z.string().optional(),
        options: z.string().optional(),
      })
      .parse(request.query);
    return context.search.search(
      params.sourceKey,
      query.keyword,
      query.next ?? query.page,
      query.options ? JSON.parse(query.options) : undefined,
    );
  });
}
