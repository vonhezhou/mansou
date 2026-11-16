import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerSearchRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "search">,
) {
  app.post("/search/plan", async (request) => {
    const body = z
      .object({
        sourceKeys: z.array(z.string().min(1)).max(2000),
        includeIsolated: z.boolean().default(false),
        preferences: z.record(z.number().finite().min(0).max(10)).default({}),
      })
      .parse(request.body);
    return context.search.plan(body.sourceKeys, body.includeIsolated, body.preferences);
  });
  app.get("/search", async (request, reply) => {
    const query = z
      .object({ keyword: z.string().min(1), sources: z.string().optional() })
      .parse(request.query);
    const controller = new AbortController();
    const cancel = () => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on("close", cancel);
    try {
      return await context.search.aggregatedSearch(
        query.keyword,
        query.sources
          ?.split(",")
          .map((source) => source.trim())
          .filter(Boolean),
        controller.signal,
      );
    } finally {
      reply.raw.off("close", cancel);
    }
  });

  app.get("/search/:sourceKey", async (request, reply) => {
    const params = z.object({ sourceKey: z.string() }).parse(request.params);
    const query = z
      .object({
        keyword: z.string().min(1),
        page: z.string().optional(),
        next: z.string().optional(),
        options: z.string().optional(),
      })
      .parse(request.query);
    const controller = new AbortController();
    const cancel = () => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on("close", cancel);
    try {
      return await context.search.search(
        params.sourceKey,
        query.keyword,
        query.next ?? query.page,
        query.options ? JSON.parse(query.options) : undefined,
        controller.signal,
      );
    } finally {
      reply.raw.off("close", cancel);
    }
  });
}
