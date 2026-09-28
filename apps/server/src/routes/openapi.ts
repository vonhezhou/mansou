import type { FastifyInstance } from "fastify";
import { openApiDocument } from "@venera/contracts";
export { openApiDocument };

export async function registerOpenApiRoutes(app: FastifyInstance) {
  app.get("/openapi.json", async () => openApiDocument);
}
