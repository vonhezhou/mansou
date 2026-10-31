import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//.test(value), { message: "订阅地址仅支持 HTTP 或 HTTPS" });
const settings = z.object({
  name: z.string().trim().min(1).max(100),
  url: httpUrl,
  cdnBaseUrl: z.union([httpUrl, z.literal("")]),
  enabled: z.boolean().optional(),
});
export async function registerSourceRepositoryRoutes(
  app: FastifyInstance,
  context: Pick<RouteContext, "repository">,
) {
  app.get("/source-repository", async () => context.repository.getRepository());
  app.post("/source-repository", async (request) =>
    context.repository.createRepository(settings.parse(request.body)),
  );
  app.post("/source-repository/reset", async () => context.repository.resetRepository());
  app.put<{ Params: { id: string } }>("/source-repository/:id", async (request) =>
    context.repository.updateRepository(settings.parse(request.body), request.params.id),
  );
  app.delete<{ Params: { id: string } }>("/source-repository/:id", async (request) =>
    context.repository.deleteRepository(request.params.id),
  );
  app.post("/source-repository/refresh", async () => ({
    sources: await context.repository.refreshRepository(),
  }));
}
