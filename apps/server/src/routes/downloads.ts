import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "./types.js";

export async function registerDownloadRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/downloads/events", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = () => reply.raw.write(`event: downloads\ndata: ${JSON.stringify(context.downloads.all())}\n\n`);
    send();
    const timer = setInterval(send, 2000);
    reply.raw.on("close", () => clearInterval(timer));
  });

  app.post("/downloads", async (request) => {
    const body = z.object({ sourceKey: z.string(), comicId: z.string(), episodeId: z.string().optional(), all: z.boolean().optional() }).parse(request.body);
    return context.downloads.create(body);
  });

  app.get("/downloads", async () => context.downloads.all());

  app.get("/downloads/:taskId", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.find(params.taskId);
    if (!task) {
      reply.code(404);
      return { error: { code: "DOWNLOAD_NOT_FOUND", message: "Download task not found", requestId: request.id } };
    }
    return task;
  });

  app.post("/downloads/:taskId/rerun", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.rerun(params.taskId);
    if (!task) {
      reply.code(404);
      return { error: { code: "DOWNLOAD_NOT_FOUND", message: "Download task not found", requestId: request.id } };
    }
    return task;
  });

  app.post("/downloads/:taskId/cancel", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.cancel(params.taskId);
    if (!task) {
      reply.code(404);
      return { error: { code: "DOWNLOAD_NOT_FOUND", message: "Download task not found", requestId: request.id } };
    }
    return task;
  });

  app.post("/downloads/:taskId/cbz", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const result = await context.downloads.exportCbz(params.taskId);
    if (!result) {
      reply.code(404);
      return { error: { code: "DOWNLOAD_NOT_FOUND", message: "Download task not found", requestId: request.id } };
    }
    return result;
  });

  app.delete("/downloads/:taskId", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const query = z.object({ files: z.coerce.boolean().optional() }).parse(request.query);
    const task = await context.downloads.delete(params.taskId, query.files ?? false);
    if (!task) {
      reply.code(404);
      return { error: { code: "DOWNLOAD_NOT_FOUND", message: "Download task not found", requestId: request.id } };
    }
    return task;
  });
}
