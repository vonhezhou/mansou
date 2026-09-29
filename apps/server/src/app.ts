import { readAuthConfig, type AuthConfig } from "./auth/config.js";
import { AuthService } from "./auth/service.js";
import { registerAuthHook } from "./auth/http.js";
import { registerAuthRoutes } from "./routes/auth.js";
import Fastify from "fastify";
import { createStorage } from "@venera/storage";
import { ZodError } from "zod";
import { PluginRuntimeError } from "@venera/plugin-runtime";
import { ApiError } from "./routes/errors.js";
import { DownloadService } from "./services/downloads/downloadService.js";
import { ImageProxyService } from "./services/imageProxy.js";
import { SourceRepositoryService } from "./repositories/sourceRepository.js";
import { PluginManager } from "@venera/plugin-runtime";
import { SourceService } from "./services/sourceService.js";
import { SearchService } from "./services/searchService.js";
import { config } from "./config/config.js";
import { ensureDir } from "./utils/fs.js";
import { ImageCache } from "./storage/imageCache.js";
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
import { registerSettingRoutes } from "./routes/settings.js";
import type { RouteContext } from "./routes/types.js";

export async function buildApp(authConfig: AuthConfig = readAuthConfig()) {
  const app = Fastify({
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    logger: {
      redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url?.split("?")[0],
          hostname: req.hostname,
          remoteAddress: req.ip,
        }),
      },
    },
  });
  const storage = createStorage(config.dataDir);
  const auth = new AuthService(storage, authConfig);
  registerAuthHook(app, auth);
  const repository = new SourceRepositoryService();
  const sources = new SourceService(new PluginManager({ ...config }), repository, storage);
  const search = new SearchService(sources);
  const imageProxy = new ImageProxyService(
    sources,
    new ImageCache(paths.imageCache, config.imageCacheMaxBytes),
  );
  const downloads = new DownloadService(sources, imageProxy, storage);
  const context: RouteContext = {
    repository,
    sources,
    search,
    imageProxy,
    downloads,
    storage,
    auth,
  };

  app.addHook("onClose", async () => {
    await sources.close();
    storage.close();
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error instanceof ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 500);
    const code =
      error instanceof ZodError || (error as { validation?: unknown }).validation
        ? "VALIDATION_ERROR"
        : error instanceof PluginRuntimeError || error instanceof ApiError
          ? error.code
          : statusCode === 404
            ? "NOT_FOUND"
            : "INTERNAL_ERROR";
    request.log.error({ code, statusCode }, "request failed");
    reply.status(statusCode).send({
      error: {
        code,
        message:
          statusCode >= 500
            ? "Internal server error"
            : error instanceof Error
              ? error.message
              : String(error),
        details: error instanceof ZodError ? error.flatten() : undefined,
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${request.method}`,
        requestId: request.id,
      },
    });
  });

  await registerHealthRoutes(app);
  await registerStaticRoutes(app);
  await app.register(
    async (api) => {
      await registerAuthRoutes(api, auth);
      await registerSourceRepositoryRoutes(api, context);
      await registerSourceRoutes(api, context);
      await registerSearchRoutes(api, context);
      await registerComicRoutes(api, context);
      await registerImageRoutes(api, context);
      await registerDownloadRoutes(api, context);
      await registerSettingRoutes(api, context);
      await registerDebugRoutes(api, context);
      await registerOpenApiRoutes(api);
    },
    { prefix: "/api/v1" },
  );

  return { app, context };
}

export async function initializeApp(context: RouteContext) {
  await Promise.all([
    ensureDir(paths.scripts),
    ensureDir(paths.sourceData),
    ensureDir(paths.imageCache),
    ensureDir(paths.downloads),
  ]);
  await context.sources.loadInstalled();
  await context.downloads.init();
}
