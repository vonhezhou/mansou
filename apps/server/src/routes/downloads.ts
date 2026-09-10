import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "./errors.js";
import type { RouteContext } from "./types.js";

export async function registerDownloadRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/downloads/events", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const unsubscribe = context.downloads.subscribe((tasks) => {
      reply.raw.write(`event: downloads\ndata: ${JSON.stringify(tasks)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(`: heartbeat\n\n`), 30000);
    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post("/downloads", async (request) => {
    const body = z
      .object({
        sourceKey: z.string(),
        comicId: z.string(),
        episodeId: z.string().optional(),
        all: z.boolean().optional(),
      })
      .parse(request.body);
    return context.downloads.create(body);
  });

  app.get("/downloads", async () => context.downloads.all());

  app.get("/downloads/:taskId", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.find(params.taskId);
    if (!task) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return task;
  });

  app.get("/downloads/:taskId/items", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    if (!context.downloads.find(params.taskId))
      throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return context.storage.listDownloadItems(params.taskId);
  });

  app.post("/downloads/:taskId/rerun", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.rerun(params.taskId);
    if (!task) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return task;
  });

  app.post("/downloads/:taskId/resume", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.resume(params.taskId);
    if (!task) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return task;
  });

  app.post("/downloads/:taskId/pause", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.pause(params.taskId);
    if (!task) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return task;
  });

  app.post("/downloads/:taskId/cancel", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = context.downloads.cancel(params.taskId);
    if (!task) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return task;
  });

  app.post("/downloads/:taskId/cbz", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const result = await context.downloads.exportCbz(params.taskId);
    if (!result) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return result;
  });

  app.post("/downloads/:taskId/items/retry", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const body = z.object({ imageKey: z.string() }).parse(request.body);
    const result = await context.downloads.retryImage(params.taskId, body.imageKey);
    if (!result) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return result;
  });

  app.post("/downloads/:taskId/items/retry-failed", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const result = await context.downloads.retryFailedImages(params.taskId);
    if (!result) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return result;
  });

  app.delete("/downloads/:taskId", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const query = z.object({ files: z.coerce.boolean().optional() }).parse(request.query);
    const task = await context.downloads.delete(params.taskId, query.files ?? false);
    if (!task) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    return task;
  });
}
