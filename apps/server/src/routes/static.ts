import type { FastifyInstance } from "fastify";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function registerStaticRoutes(app: FastifyInstance) {
  const publicDir = path.join(process.cwd(), "public");
  const webDistDir = path.join(process.cwd(), "..", "web", "dist");
  const staticDir = existsSync(path.join(webDistDir, "index.html")) ? webDistDir : publicDir;

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return readFile(path.join(staticDir, "index.html"), "utf8");
  });

  app.get("/assets/*", async (request, reply) => {
    const assetPath = (request.params as { "*": string })["*"];
    const file = path.join(staticDir, "assets", assetPath);
    if (!file.startsWith(path.join(staticDir, "assets"))) return reply.code(404).send();
    reply.type(contentType(file));
    return readFile(file);
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

function contentType(file: string) {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
