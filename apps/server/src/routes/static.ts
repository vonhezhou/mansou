import compress from "@fastify/compress";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function registerStaticRoutes(app: FastifyInstance) {
  // 压缩仅限静态路由，避免缓冲下载事件流或重复压缩图片与 CBZ。
  await app.register(async (app) => {
    await app.register(compress, { encodings: ["br", "gzip"] });
    const publicDir = path.resolve(process.cwd(), "public");
    const webDistDir = path.resolve(process.cwd(), "..", "web", "dist");
    const staticDir = existsSync(path.join(webDistDir, "index.html")) ? webDistDir : publicDir;
    const assetsDir = path.resolve(staticDir, "assets");

    app.get("/", async (_request, reply) => {
      reply.header("Cache-Control", "no-cache");
      reply.type("text/html; charset=utf-8");
      return readFile(path.join(staticDir, "index.html"), "utf8");
    });

    app.get("/assets/*", async (request, reply) => {
      const assetPath = (request.params as { "*": string })["*"];
      const file = resolveAssetPath(assetsDir, assetPath);
      if (!file) return reply.code(404).send();
      let data: Buffer;
      try {
        data = await readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return reply.code(404).send();
        throw error;
      }
      // Vite 的内容哈希随文件变化，只有这类资源可以长期缓存。
      reply.header(
        "Cache-Control",
        /-[\w-]{8,}\.[\w]+$/.test(path.basename(file))
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      reply.type(contentType(file));
      return data;
    });

    app.get("/app.js", async (_request, reply) => {
      reply.type("text/javascript; charset=utf-8");
      return readFile(path.join(publicDir, "app.js"), "utf8");
    });

    app.get("/style.css", async (_request, reply) => {
      reply.type("text/css; charset=utf-8");
      return readFile(path.join(publicDir, "style.css"), "utf8");
    });
  });
}

export function resolveAssetPath(assetsDir: string, assetPath: string) {
  const file = path.resolve(assetsDir, assetPath);
  const relative = path.relative(assetsDir, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return file;
}

function contentType(file: string) {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
