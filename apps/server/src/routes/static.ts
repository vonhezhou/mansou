import type { FastifyInstance } from "fastify";
import path from "node:path";
import { readFile } from "node:fs/promises";

export async function registerStaticRoutes(app: FastifyInstance) {
  const publicDir = path.join(process.cwd(), "public");

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return readFile(path.join(publicDir, "index.html"), "utf8");
  });

  app.get("/app.js", async (_request, reply) => {
    reply.type("text/javascript; charset=utf-8");
    return readFile(path.join(publicDir, "app.js"), "utf8");
  });

  app.get("/style.css", async (_request, reply) => {
    reply.type("text/css; charset=utf-8");
    return readFile(path.join(publicDir, "style.css"), "utf8");
  });
}
