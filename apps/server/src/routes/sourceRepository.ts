import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerSourceRepositoryRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "repository">,
) {
  app.get("/source-repository", async () => context.repository.getRepository());

  app.put("/source-repository", async (request) => {
    const httpUrl = z
      .string()
      .trim()
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "订阅地址仅支持 HTTP 或 HTTPS",
      });
    const body = z
      .object({ url: httpUrl, cdnBaseUrl: z.union([httpUrl, z.literal("")]) })
      .parse(request.body);
    return context.repository.updateRepository(body);
  });

  app.post("/source-repository/refresh", async () => ({
    sources: await context.repository.refreshRepository(),
  }));
}
