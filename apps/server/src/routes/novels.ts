import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { SourceError } from "@mansou/novel-engine";
import type { Application } from "../application.js";
import type { components } from "@mansou/contracts";
import { once } from "node:events";

async function withCancellation<T>(reply: FastifyReply, work: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const cancel = () => {
    if (!reply.raw.writableFinished) controller.abort();
  };
  reply.raw.on("close", cancel);
  try {
    return await work(controller.signal);
  } finally {
    controller.abort();
    reply.raw.off("close", cancel);
  }
}

export async function registerNovelRoutes(
  app: FastifyInstance,
  context: Pick<Application, "novelSources" | "novelDownloads">,
) {
  const httpUrl = z
    .string()
    .max(8192)
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "仅支持 HTTP/HTTPS 地址");
  const subscription = z.object({
    name: z.string().trim().min(1).max(100),
    url: httpUrl,
    enabled: z.boolean().optional(),
  });
  const book = z.object({
    name: z.string().trim().min(1).max(500),
    author: z.string().max(500).default(""),
    bookUrl: httpUrl,
  });
  const id = (params: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(params).id;
  // 书源错误属于可反馈的业务失败，避免统一异常处理掩盖不支持的语法和上游错误。
  await app.register(
    async (api) => {
      api.setErrorHandler((error, _request, reply) => {
        if (error instanceof SourceError)
          return reply.code(422).send({ error: { code: error.code, message: error.message } });
        throw error;
      });
      api.get("/sources", async () => context.novelSources.state());
      api.post("/sources/import", { bodyLimit: 8 * 1024 * 1024 }, async (request) => {
        const body = z.object({ sources: z.unknown() }).parse(request.body);
        return context.novelSources.import(body.sources);
      });
      api.post("/sources/batch", async (request) => {
        const body = z
          .object({
            ids: z.array(z.string().min(1).max(200)).min(1).max(2000),
            action: z.enum(["enable", "disable", "delete"]),
          })
          .parse(request.body);
        return context.novelSources.batch(body.ids, body.action);
      });
      api.get(
        "/sources/:id/rule",
        async (request) => context.novelSources.source(id(request.params), false).raw,
      );
      api.put("/sources/:id/favorite", async (request) =>
        context.novelSources.setFavorite(
          id(request.params),
          z.object({ favorite: z.boolean() }).parse(request.body).favorite,
        ),
      );
      api.put("/sources/:id", async (request) =>
        context.novelSources.setEnabled(
          id(request.params),
          z.object({ enabled: z.boolean() }).parse(request.body).enabled,
        ),
      );
      api.delete("/sources/:id", async (request) =>
        context.novelSources.deleteSource(id(request.params)),
      );
      api.post("/subscriptions", async (request) =>
        context.novelSources.saveSubscription(subscription.parse(request.body)),
      );
      api.put("/subscriptions/:id", async (request) =>
        context.novelSources.saveSubscription(subscription.parse(request.body), id(request.params)),
      );
      api.delete("/subscriptions/:id", async (request) =>
        context.novelSources.deleteSubscription(id(request.params)),
      );
      api.post("/subscriptions/:id/refresh", async (request) =>
        context.novelSources.refresh(id(request.params)),
      );
      api.post("/search", async (request, reply) => {
        const body = z
          .object({
            keyword: z.string().trim().min(1).max(100),
            page: z.number().int().min(1).max(1000).default(1),
            sourceIds: z.array(z.string().max(200)).max(100).optional(),
          })
          .parse(request.body);
        return withCancellation(reply, async (signal) => {
          let started = false;
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          const send = async (event: components["schemas"]["NovelSearchEvent"]) => {
            if (signal.aborted) return;
            if (!started) {
              started = true;
              reply.hijack();
              reply.raw.writeHead(200, {
                "content-type": "application/x-ndjson; charset=utf-8",
                "cache-control": "no-store",
                "x-accel-buffering": "no",
              });
              heartbeat = setInterval(() => {
                if (!signal.aborted && !reply.raw.writableNeedDrain) reply.raw.write("\n");
              }, 15000);
            }
            // 慢客户端暂停后续调度，避免把全部搜索结果堆积在响应缓冲区。
            if (!reply.raw.write(`${JSON.stringify(event)}\n`))
              await once(reply.raw, "drain", { signal });
          };
          try {
            const result = await context.novelSources.search(
              body.keyword,
              body.page,
              body.sourceIds,
              signal,
              (progress) =>
                send(
                  progress.source
                    ? { type: "source", source: progress.source, elapsedMs: progress.elapsedMs }
                    : {
                        type: "start",
                        keyword: body.keyword,
                        page: body.page,
                        totalSources: progress.totalSources,
                      },
                ),
            );
            await send({
              type: "complete",
              cancelled: result.cancelled,
              elapsedMs: result.elapsedMs,
            });
          } catch (error) {
            if (!started) throw error;
            if (!signal.aborted) {
              request.log.error({ err: error }, "Novel search stream failed");
              await send({ type: "error", message: "搜索中断，请重试；已返回结果仍可查看" });
            }
          } finally {
            clearInterval(heartbeat);
            if (started) reply.raw.end();
          }
        });
      });
      api.post("/catalog", async (request, reply) => {
        const body = z.object({ sourceId: z.string(), bookUrl: httpUrl }).parse(request.body);
        return withCancellation(reply, (signal) =>
          context.novelSources.catalog(body.sourceId, body.bookUrl, signal),
        );
      });
      api.get("/downloads", async () => context.novelDownloads.all());
      api.post("/downloads", async (request) =>
        context.novelDownloads.create(
          z
            .object({
              sourceId: z.string(),
              book,
              all: z.boolean().default(true),
              start: z.number().int().min(1).max(50000).default(1),
              limit: z.number().int().min(1).max(50000).default(3),
            })
            .parse(request.body),
        ),
      );
      for (const action of ["pause", "resume", "cancel"] as const)
        api.post(`/downloads/:id/${action}`, async (request) =>
          context.novelDownloads.action(id(request.params), action),
        );
      api.delete("/downloads/:id", async (request) =>
        context.novelDownloads.delete(id(request.params)),
      );
      api.get("/downloads/:id/txt", async (request, reply) => {
        const file = await context.novelDownloads.openTxt(id(request.params));
        return reply
          .type("text/plain; charset=utf-8")
          .header(
            "content-disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          )
          .send(file.stream);
      });
    },
    { prefix: "/novels" },
  );
}
