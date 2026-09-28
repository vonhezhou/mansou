import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  const health = async () => ({ ok: true, name: "venera_web" });
  app.get("/health", health);
  app.get("/api/v1/health", health);
}
