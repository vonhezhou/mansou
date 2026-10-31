import { registerNovelRoutes } from "./routes/novels.js";
import { createApplication, type Application } from "./application.js";
import { readConfig, validateConfig, type AppConfig } from "./config/config.js";
import { AppError } from "./errors.js";
import { applicationStatus, publicPluginErrorMessage } from "./routes/errors.js";
import { readAuthConfig, type AuthConfig } from "./auth/config.js";
import { registerAuthHook } from "./auth/http.js";
import { registerAuthRoutes } from "./routes/auth.js";
import Fastify from "fastify";
import { ZodError } from "zod";
import { PluginRuntimeError } from "@mansou/plugin-runtime";
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

export async function buildApp(
  authConfig: AuthConfig = readAuthConfig(),
  config: AppConfig = readConfig(),
) {
  config = Object.freeze({ ...config });
  validateConfig(config);
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
  const context = createApplication(config, authConfig, (error) =>
    app.log.error({ error }, "Background operation failed"),
  );
  app.addHook("preClose", async () => {
    await Promise.all([
      context.downloads.close(),
      context.novelDownloads.close(),
      context.novelEngine.close(),
    ]);
  });
  app.addHook("onClose", async () => context.close());
  registerAuthHook(app, context.auth);
  try {
    app.setErrorHandler((error, request, reply) => {
      const statusCode =
        error instanceof ZodError
          ? 400
          : error instanceof AppError
            ? applicationStatus(error.code)
            : ((error as { statusCode?: number }).statusCode ?? 500);
      const code =
        error instanceof ZodError || (error as { validation?: unknown }).validation
          ? "VALIDATION_ERROR"
          : error instanceof PluginRuntimeError || error instanceof AppError
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
              ? error instanceof PluginRuntimeError
                ? publicPluginErrorMessage(error.code)
                : "Internal server error"
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
        await registerAuthRoutes(api, context.auth);
        await registerSourceRepositoryRoutes(api, context);
        await registerSourceRoutes(api, context);
        await registerSearchRoutes(api, context);
        await registerNovelRoutes(api, context);
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
  } catch (error) {
    await app.close();
    throw error;
  }
}

export async function initializeApp(context: Application) {
  try {
    await context.initialize();
  } catch (error) {
    await context.close();
    throw error;
  }
}
