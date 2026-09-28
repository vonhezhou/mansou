import type { FastifyInstance } from "fastify";
import path from "node:path";
import { z } from "zod";
import { notFound } from "./errors.js";
import type { RouteContext } from "./types.js";

export async function registerDownloadRoutes(app: FastifyInstance, context: RouteContext) {
  const streams = new Set<import("node:http").ServerResponse>();
  app.addHook("preClose", async () => {
    for (const stream of streams) stream.end();
  });
  app.get("/downloads/events", async (request, reply) => {
    const identity = request.identity!;
    reply.hijack();
    streams.add(reply.raw);
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    });
    const valid = () => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return false;
      if (context.auth.valid(identity)) return true;
      reply.raw.write("event: auth-expired\ndata: {}\n\n");
      reply.raw.end();
      return false;
    };
    const unsubscribe = context.downloads.subscribe((tasks) => {
      if (valid()) reply.raw.write(`event: downloads\ndata: ${JSON.stringify(tasks)}\n\n`);
    });
    // Recheck persisted credentials so CLI password resets also close idle streams.
    const expiry = setInterval(valid, 1000);
    const heartbeat = setInterval(() => {
      if (valid()) reply.raw.write(": heartbeat\n\n");
    }, 30000);
    reply.raw.on("close", () => {
      clearInterval(expiry);
      clearInterval(heartbeat);
      unsubscribe();
      streams.delete(reply.raw);
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

  app.get("/downloads/:taskId/cbz", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const result = await context.downloads.openCbz(params.taskId);
    if (!result) throw notFound("DOWNLOAD_NOT_FOUND", "Download task not found");
    reply
      .type("application/zip")
      .header(
        "content-disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(result.path))}`,
      );
    return reply.send(result.stream);
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
