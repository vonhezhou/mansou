import Fastify from "fastify";
import { ZodError } from "zod";
import { DownloadService } from "./services/downloadService.js";
import { ImageProxyService } from "./services/imageProxy.js";
import { SourceRepositoryService } from "./services/sourceRepository.js";
import { SourceRuntime } from "./runtime/sourceRuntime.js";
import { ensureDir } from "./utils/fs.js";
import { paths } from "./storage/paths.js";
import { registerComicRoutes } from "./routes/comics.js";
import { registerDebugRoutes } from "./routes/debug.js";
import { registerDownloadRoutes } from "./routes/downloads.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImageRoutes } from "./routes/images.js";
import { registerOpenApiRoutes } from "./routes/openapi.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerSourceRepositoryRoutes } from "./routes/sourceRepository.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { registerStaticRoutes } from "./routes/static.js";
import type { RouteContext } from "./routes/types.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const repository = new SourceRepositoryService();
  const runtime = new SourceRuntime(repository);
  const imageProxy = new ImageProxyService(runtime);
  const downloads = new DownloadService(runtime, imageProxy);
  const context: RouteContext = { repository, runtime, imageProxy, downloads };

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error instanceof ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 500);
    const code = error instanceof ZodError ? "VALIDATION_ERROR" : statusCode === 404 ? "NOT_FOUND" : "INTERNAL_ERROR";
    request.log.error({ error }, "request failed");
    reply.status(statusCode).send({
      error: {
        code,
        message: statusCode >= 500 ? "Internal server error" : error instanceof Error ? error.message : String(error),
        details: error instanceof ZodError ? error.flatten() : undefined,
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${request.method} ${request.url}`,
        requestId: request.id,
      },
    });
  });

  await registerHealthRoutes(app);
  await registerStaticRoutes(app);
  await app.register(async (api) => {
    await registerSourceRepositoryRoutes(api, context);
    await registerSourceRoutes(api, context);
    await registerSearchRoutes(api, context);
    await registerComicRoutes(api, context);
    await registerImageRoutes(api, context);
    await registerDownloadRoutes(api, context);
    await registerDebugRoutes(api, context);
    await registerOpenApiRoutes(api);
  }, { prefix: "/api/v1" });

  return { app, context };
}

export async function initializeApp(context: RouteContext) {
  await Promise.all([
    ensureDir(paths.scripts),
    ensureDir(paths.sourceData),
    ensureDir(paths.imageCache),
    ensureDir(paths.downloads),
  ]);
  await context.runtime.loadInstalled();
  await context.downloads.init();
}
