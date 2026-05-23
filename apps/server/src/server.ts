import Fastify from "fastify";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { config } from "./config/config.js";
import { SourceRepositoryService } from "./services/sourceRepository.js";
import { SourceRuntime } from "./runtime/sourceRuntime.js";
import { ImageProxyService } from "./services/imageProxy.js";
import { DownloadService } from "./services/downloadService.js";
import { ensureDir } from "./utils/fs.js";
import { paths } from "./storage/paths.js";
import { getNoProxyRules, getProxyUrl } from "./utils/fetch.js";

const app = Fastify({ logger: true });
const repository = new SourceRepositoryService();
const runtime = new SourceRuntime(repository);
const imageProxy = new ImageProxyService(runtime);
const downloads = new DownloadService(runtime, imageProxy);
const publicDir = path.join(process.cwd(), "public");

process.on("unhandledRejection", (error) => {
  app.log.error({ error }, "Unhandled async task rejected");
});

app.get("/health", async () => ({
  ok: true,
  name: "venera_web",
  dataDir: config.dataDir,
  proxy: getProxyUrl(),
  noProxy: getNoProxyRules(),
}));

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

app.get("/api/source-repository", async () => ({
  url: config.sourceListUrl,
  sources: await repository.getAvailableSources(),
}));

app.post("/api/source-repository/refresh", async () => ({
  sources: await repository.refreshRepository(),
}));

app.get("/api/sources/available", async () => repository.getAvailableSources());

app.get("/api/sources/installed", async () => runtime.all());
app.get("/api/sources", async () => runtime.all());

app.post("/api/sources/install", async (request) => {
  const body = z.object({ source: z.string().min(1) }).parse(request.body);
  const installed = await repository.installSource(body.source);
  const loaded = await runtime.loadScript(installed.filePath);
  return { installed, loaded: { key: loaded.key, name: loaded.name, version: loaded.version } };
});

app.post("/api/sources/reload", async () => ({ loaded: await runtime.loadInstalled() }));

app.get("/api/sources/:sourceKey", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  return runtime.all().find((source) => source.key === params.sourceKey) ?? null;
});

app.get("/api/sources/:sourceKey/search-options", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  return runtime.searchOptions(params.sourceKey);
});

app.get("/api/sources/:sourceKey/cookies", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  return runtime.cookies(params.sourceKey);
});

app.put("/api/sources/:sourceKey/cookies", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  const body = z
    .object({ url: z.string().url(), cookies: z.array(z.union([z.string(), z.record(z.unknown())])) })
    .parse(request.body);
  return runtime.importCookies(params.sourceKey, body.url, body.cookies);
});

app.delete("/api/sources/:sourceKey/cookies", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  await runtime.clearCookies(params.sourceKey);
  return { ok: true };
});

app.get("/api/sources/:sourceKey/settings", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  return runtime.sourceSettings(params.sourceKey);
});

app.put("/api/sources/:sourceKey/settings", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  const body = z.object({ values: z.record(z.unknown()) }).parse(request.body);
  return runtime.updateSourceSettings(params.sourceKey, body.values);
});

app.delete("/api/sources/:sourceKey/settings", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  return runtime.clearSourceSettings(params.sourceKey);
});

app.get("/api/search", async (request) => {
  const query = z
    .object({ keyword: z.string().min(1), sources: z.string().optional() })
    .parse(request.query);
  return runtime.aggregatedSearch(
    query.keyword,
    query.sources?.split(",").map((source) => source.trim()).filter(Boolean),
  );
});

app.get("/api/search/:sourceKey", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  const query = z
    .object({ keyword: z.string().min(1), page: z.string().optional(), next: z.string().optional(), options: z.string().optional() })
    .parse(request.query);
  return runtime.search(
    params.sourceKey,
    query.keyword,
    query.next ?? query.page,
    query.options ? JSON.parse(query.options) : undefined,
  );
});

app.get("/api/debug/:sourceKey/search", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  const query = z.object({ keyword: z.string().default("test"), page: z.string().optional() }).parse(request.query);
  return debugRun("search", () => runtime.search(params.sourceKey, query.keyword, query.page));
});

app.get("/api/debug/:sourceKey/comics/:comicId", async (request) => {
  const params = z.object({ sourceKey: z.string(), comicId: z.string() }).parse(request.params);
  return debugRun("detail", () => runtime.comicDetails(params.sourceKey, params.comicId));
});

app.get("/api/debug/:sourceKey/comics/:comicId/episodes/:episodeId/pages", async (request) => {
  const params = z.object({ sourceKey: z.string(), comicId: z.string(), episodeId: z.string() }).parse(request.params);
  return debugRun("pages", () => runtime.comicPages(params.sourceKey, params.comicId, params.episodeId));
});

app.get("/api/debug/:sourceKey/image", async (request) => {
  const params = z.object({ sourceKey: z.string() }).parse(request.params);
  const query = z
    .object({ imageKey: z.string(), comicId: z.string().optional(), episodeId: z.string().optional() })
    .parse(request.query);
  return debugRun("image", async () => {
    const image = await imageProxy.loadBytes({ sourceKey: params.sourceKey, ...query }, false);
    return { contentType: image.contentType, bytes: image.data.length };
  });
});

app.get("/api/comics/:sourceKey/:comicId", async (request) => {
  const params = z.object({ sourceKey: z.string(), comicId: z.string() }).parse(request.params);
  return runtime.comicDetails(params.sourceKey, params.comicId);
});

app.get("/api/comics/:sourceKey/:comicId/episodes/:episodeId/pages", async (request) => {
  const params = z
    .object({ sourceKey: z.string(), comicId: z.string(), episodeId: z.string() })
    .parse(request.params);
  return runtime.comicPages(params.sourceKey, params.comicId, params.episodeId);
});

app.get("/api/image", async (request, reply) => {
  const query = z
    .object({
      sourceKey: z.string(),
      imageKey: z.string(),
      comicId: z.string().optional(),
      episodeId: z.string().optional(),
      thumbnail: z.coerce.boolean().optional(),
    })
    .parse(request.query);
  const image = await imageProxy.load(query);
  reply.header("content-type", image.contentType);
  reply.header("cache-control", "public, max-age=86400");
  return reply.send(image.data);
});

app.post("/api/downloads", async (request) => {
  const body = z
    .object({ sourceKey: z.string(), comicId: z.string(), episodeId: z.string().optional(), all: z.boolean().optional() })
    .parse(request.body);
  return downloads.create(body);
});

app.get("/api/downloads", async () => downloads.all());

app.get("/api/downloads/:taskId", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const task = downloads.find(params.taskId);
  if (!task) {
    reply.code(404);
    return { error: "Download task not found" };
  }
  return task;
});

app.post("/api/downloads/:taskId/rerun", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const task = downloads.rerun(params.taskId);
  if (!task) {
    reply.code(404);
    return { error: "Download task not found" };
  }
  return task;
});

app.post("/api/downloads/:taskId/cancel", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const task = downloads.cancel(params.taskId);
  if (!task) {
    reply.code(404);
    return { error: "Download task not found" };
  }
  return task;
});

app.post("/api/downloads/:taskId/cbz", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const result = await downloads.exportCbz(params.taskId);
  if (!result) {
    reply.code(404);
    return { error: "Download task not found" };
  }
  return result;
});

app.delete("/api/downloads/:taskId", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const query = z.object({ files: z.coerce.boolean().optional() }).parse(request.query);
  const task = await downloads.delete(params.taskId, query.files ?? false);
  if (!task) {
    reply.code(404);
    return { error: "Download task not found" };
  }
  return task;
});

async function main() {
  await Promise.all([
    ensureDir(paths.scripts),
    ensureDir(paths.sourceData),
    ensureDir(paths.imageCache),
    ensureDir(paths.downloads),
  ]);
  await runtime.loadInstalled();
  await downloads.init();
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});

async function debugRun(name: string, task: () => Promise<unknown>) {
  const startedAt = Date.now();
  try {
    const data = await task();
    return {
      ok: true,
      name,
      durationMs: Date.now() - startedAt,
      summary: summarizeDebugData(data),
    };
  } catch (error) {
    return {
      ok: false,
      name,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      hint: debugHint(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : undefined,
    };
  }
}

function debugHint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("403")) {
    return "The source rejected the request. Check cookies, referer/user-agent headers, Cloudflare, or no-proxy rules.";
  }
  if (message.includes("302")) {
    return "The source returned a redirect. Check whether the target domain should be added to VENERA_NO_PROXY or handled by a source fallback.";
  }
  if (message.includes("fetch failed") || message.includes("aborted")) {
    return "Network request failed. Check VENERA_PROXY, VENERA_NO_PROXY, and VENERA_REQUEST_TIMEOUT_MS.";
  }
  if (message.includes("not defined") || message.includes("is not a function")) {
    return "The plugin used a Venera JavaScript API that is not implemented in the Node runtime yet.";
  }
  return undefined;
}

function summarizeDebugData(data: unknown): unknown {
  if (data && typeof data === "object" && "comics" in data && Array.isArray((data as { comics: unknown[] }).comics)) {
    const comics = (data as { comics: unknown[] }).comics;
    return { count: comics.length, first: comics[0] ?? null };
  }
  if (data && typeof data === "object" && "images" in data && Array.isArray((data as { images: string[] }).images)) {
    const images = (data as { images: string[] }).images;
    return { count: images.length, first: images[0] ?? null };
  }
  if (data && typeof data === "object" && "title" in data) {
    const details = data as { title?: string; chapters?: Record<string, string>; thumbnails?: string[] };
    return {
      title: details.title,
      chapterCount: Object.keys(details.chapters ?? {}).length,
      thumbnailCount: details.thumbnails?.length ?? 0,
    };
  }
  return data;
}
