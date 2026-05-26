import type { FastifyInstance } from "fastify";

const json = { type: "object", additionalProperties: true } as const;
const stringParam = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });
const queryParam = (name: string, required = false) => ({ name, in: "query", required, schema: { type: "string" } });
const response = (schema: unknown, description = "OK") => ({ description, content: { "application/json": { schema } } });

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Venera Web API",
    version: "0.1.0",
    description: "HTTP API for source management, search, reading, downloads, cache and diagnostics.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }, { veneraToken: [] }, {}],
  paths: {
    "/health": {
      get: { operationId: "getHealthLegacy", tags: ["system"], summary: "Health check", security: [], responses: { "200": response({ $ref: "#/components/schemas/Health" }) } },
    },
    "/api/v1/health": {
      get: { operationId: "getHealth", tags: ["system"], summary: "Health check", security: [], responses: { "200": response({ $ref: "#/components/schemas/Health" }) } },
    },
    "/api/v1/openapi.json": {
      get: { operationId: "getOpenApi", tags: ["system"], summary: "OpenAPI document", responses: { "200": response(json) } },
    },
    "/api/v1/source-repository": {
      get: { operationId: "getSourceRepository", tags: ["sourceRepository"], summary: "List repository sources", responses: { "200": response({ $ref: "#/components/schemas/SourceRepository" }) } },
    },
    "/api/v1/source-repository/refresh": {
      post: { operationId: "refreshSourceRepository", tags: ["sourceRepository"], summary: "Refresh repository index", responses: { "200": response({ type: "object", properties: { sources: { type: "array", items: { $ref: "#/components/schemas/RepositorySource" } } }, required: ["sources"] }) } },
    },
    "/api/v1/sources": {
      get: { operationId: "listSources", tags: ["sources"], summary: "List installed sources", responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/SourceSummary" } }) } },
    },
    "/api/v1/sources/available": {
      get: { operationId: "listAvailableSources", tags: ["sources"], summary: "List available repository sources", responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/RepositorySource" } }) } },
    },
    "/api/v1/sources/installed": {
      get: { operationId: "listInstalledSources", tags: ["sources"], summary: "List installed sources", responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/SourceSummary" } }) } },
    },
    "/api/v1/sources/metadata": {
      get: { operationId: "listSourceMetadata", tags: ["sources"], summary: "List persisted source metadata", responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/SourceMetadata" } }) } },
    },
    "/api/v1/sources/install": {
      post: { operationId: "installSource", tags: ["sources"], summary: "Install source", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { source: { type: "string" } }, required: ["source"] } } } }, responses: { "200": response(json), "400": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/sources/reload": {
      post: { operationId: "reloadSources", tags: ["sources"], summary: "Reload installed source scripts", responses: { "200": response(json) } },
    },
    "/api/v1/sources/{sourceKey}": {
      get: { operationId: "getSource", tags: ["sources"], summary: "Get source", parameters: [stringParam("sourceKey")], responses: { "200": response({ anyOf: [{ $ref: "#/components/schemas/SourceSummary" }, { type: "null" }] }) } },
    },
    "/api/v1/sources/{sourceKey}/enabled": {
      put: { operationId: "setSourceEnabled", tags: ["sources"], parameters: [stringParam("sourceKey")], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"] } } } }, responses: { "200": response({ $ref: "#/components/schemas/SourceMetadata" }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/sources/{sourceKey}/search-options": {
      get: { operationId: "getSourceSearchOptions", tags: ["sources"], parameters: [stringParam("sourceKey")], responses: { "200": response({ type: "array", items: json }) } },
    },
    "/api/v1/sources/{sourceKey}/settings": {
      get: { operationId: "getSourceSettings", tags: ["sources"], parameters: [stringParam("sourceKey")], responses: { "200": response({ $ref: "#/components/schemas/SourceSettings" }) } },
      put: { operationId: "updateSourceSettings", tags: ["sources"], parameters: [stringParam("sourceKey")], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { values: json }, required: ["values"] } } } }, responses: { "200": response({ $ref: "#/components/schemas/SourceSettings" }) } },
      delete: { operationId: "clearSourceSettings", tags: ["sources"], parameters: [stringParam("sourceKey")], responses: { "200": response({ $ref: "#/components/schemas/SourceSettings" }) } },
    },
    "/api/v1/sources/{sourceKey}/cookies": {
      get: { operationId: "listSourceCookies", tags: ["sources"], parameters: [stringParam("sourceKey")], responses: { "200": response({ type: "array", items: json }) } },
      put: { operationId: "importSourceCookies", tags: ["sources"], parameters: [stringParam("sourceKey")], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", format: "uri" }, cookies: { type: "array", items: { anyOf: [{ type: "string" }, json] } }, text: { type: "string" } }, required: ["url"] } } } }, responses: { "200": response({ type: "array", items: json }) } },
      delete: { operationId: "clearSourceCookies", tags: ["sources"], parameters: [stringParam("sourceKey")], responses: { "200": response({ $ref: "#/components/schemas/Ok" }) } },
    },
    "/api/v1/search": {
      get: { operationId: "aggregatedSearch", tags: ["search"], parameters: [queryParam("keyword", true), queryParam("sources")], responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/AggregatedSearchItem" } }), "400": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/search/{sourceKey}": {
      get: { operationId: "searchSource", tags: ["search"], parameters: [stringParam("sourceKey"), queryParam("keyword", true), queryParam("page"), queryParam("next"), queryParam("options")], responses: { "200": response({ $ref: "#/components/schemas/SearchResult" }), "400": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/comics/{sourceKey}/{comicId}": {
      get: { operationId: "getComicDetails", tags: ["comics"], parameters: [stringParam("sourceKey"), stringParam("comicId")], responses: { "200": response({ $ref: "#/components/schemas/ComicDetails" }) } },
    },
    "/api/v1/comics/{sourceKey}/detail": {
      get: { operationId: "getComicDetailsByQuery", tags: ["comics"], parameters: [stringParam("sourceKey"), queryParam("comicId", true)], responses: { "200": response({ $ref: "#/components/schemas/ComicDetails" }) } },
    },
    "/api/v1/comics/{sourceKey}/{comicId}/episodes/{episodeId}/pages": {
      get: { operationId: "getEpisodePages", tags: ["comics"], parameters: [stringParam("sourceKey"), stringParam("comicId"), stringParam("episodeId")], responses: { "200": response({ $ref: "#/components/schemas/EpisodePages" }) } },
    },
    "/api/v1/comics/{sourceKey}/pages": {
      get: { operationId: "getEpisodePagesByQuery", tags: ["comics"], parameters: [stringParam("sourceKey"), queryParam("comicId", true), queryParam("episodeId", true)], responses: { "200": response({ $ref: "#/components/schemas/EpisodePages" }) } },
    },
    "/api/v1/image": {
      get: { operationId: "getImage", tags: ["images"], parameters: [queryParam("sourceKey", true), queryParam("imageKey", true), queryParam("comicId"), queryParam("episodeId"), { name: "thumbnail", in: "query", schema: { type: "boolean" } }, queryParam("access_token")], responses: { "200": { description: "Image bytes", content: { "image/*": { schema: { type: "string", format: "binary" } }, "application/octet-stream": { schema: { type: "string", format: "binary" } } } } } },
    },
    "/api/v1/downloads": {
      get: { operationId: "listDownloads", tags: ["downloads"], responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/DownloadTask" } }) } },
      post: { operationId: "createDownload", tags: ["downloads"], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateDownloadRequest" } } } }, responses: { "200": response({ $ref: "#/components/schemas/DownloadTask" }) } },
    },
    "/api/v1/downloads/events": {
      get: { operationId: "subscribeDownloads", tags: ["downloads"], parameters: [queryParam("access_token")], responses: { "200": { description: "Server-sent events stream" } } },
    },
    "/api/v1/downloads/{taskId}": {
      get: { operationId: "getDownload", tags: ["downloads"], parameters: [stringParam("taskId")], responses: { "200": response({ $ref: "#/components/schemas/DownloadTask" }), "404": { $ref: "#/components/responses/Error" } } },
      delete: { operationId: "deleteDownload", tags: ["downloads"], parameters: [stringParam("taskId"), { name: "files", in: "query", schema: { type: "boolean" } }], responses: { "200": response({ $ref: "#/components/schemas/DownloadTask" }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/downloads/{taskId}/items": {
      get: { operationId: "listDownloadItems", tags: ["downloads"], parameters: [stringParam("taskId")], responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/DownloadItem" } }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/downloads/{taskId}/items/retry": {
      post: { operationId: "retryDownloadImage", tags: ["downloads"], parameters: [stringParam("taskId")], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { imageKey: { type: "string" } }, required: ["imageKey"] } } } }, responses: { "200": response({ type: "object", properties: { task: { $ref: "#/components/schemas/DownloadTask" }, item: { $ref: "#/components/schemas/DownloadItem" } }, required: ["task", "item"] }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/downloads/{taskId}/cancel": {
      post: { operationId: "cancelDownload", tags: ["downloads"], parameters: [stringParam("taskId")], responses: { "200": response({ $ref: "#/components/schemas/DownloadTask" }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/downloads/{taskId}/rerun": {
      post: { operationId: "rerunDownload", tags: ["downloads"], parameters: [stringParam("taskId")], responses: { "200": response({ $ref: "#/components/schemas/DownloadTask" }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/downloads/{taskId}/cbz": {
      post: { operationId: "exportDownloadCbz", tags: ["downloads"], parameters: [stringParam("taskId")], responses: { "200": response({ type: "object", properties: { taskId: { type: "string" }, path: { type: "string" } }, required: ["taskId", "path"] }), "404": { $ref: "#/components/responses/Error" } } },
    },
    "/api/v1/library/history": {
      get: { operationId: "listHistory", tags: ["library"], responses: { "200": response({ type: "array", items: { $ref: "#/components/schemas/HistoryItem" } }) } },
    },
    "/api/v1/library/history/{sourceKey}/{comicId}": {
      get: { operationId: "getHistory", tags: ["library"], parameters: [stringParam("sourceKey"), stringParam("comicId")], responses: { "200": response({ anyOf: [{ $ref: "#/components/schemas/HistoryItem" }, { type: "null" }] }) } },
      put: { operationId: "saveHistory", tags: ["library"], parameters: [stringParam("sourceKey"), stringParam("comicId")], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { episodeId: { type: "string" }, page: { type: "number" }, progress: { type: "number" } } } } } }, responses: { "200": response({ $ref: "#/components/schemas/HistoryItem" }) } },
    },
    "/api/v1/settings/cache": {
      get: { operationId: "getCacheStats", tags: ["settings"], responses: { "200": response({ $ref: "#/components/schemas/CacheStats" }) } },
    },
    "/api/v1/settings/cache/images": {
      delete: { operationId: "clearImageCache", tags: ["settings"], responses: { "200": response({ $ref: "#/components/schemas/CacheStats" }) } },
    },
    "/api/v1/settings/cache/images/prune": {
      post: { operationId: "pruneImageCache", tags: ["settings"], responses: { "200": response({ $ref: "#/components/schemas/CacheStats" }) } },
    },
    "/api/v1/debug/runtime/compatibility": {
      get: { operationId: "getRuntimeCompatibility", tags: ["debug"], responses: { "200": response({ type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/RuntimeCompatibilityItem" } } }, required: ["items"] }) } },
    },
    "/api/v1/debug/runtime/diagnostics": {
      get: { operationId: "getRuntimeDiagnostics", tags: ["debug"], responses: { "200": response({ $ref: "#/components/schemas/RuntimeDiagnostics" }) } },
    },
    "/api/v1/debug/{sourceKey}/search": {
      get: { operationId: "debugSearch", tags: ["debug"], parameters: [stringParam("sourceKey"), queryParam("keyword"), queryParam("page")], responses: { "200": response({ $ref: "#/components/schemas/DebugResult" }) } },
    },
    "/api/v1/debug/{sourceKey}/comics/{comicId}": {
      get: { operationId: "debugComicDetails", tags: ["debug"], parameters: [stringParam("sourceKey"), stringParam("comicId")], responses: { "200": response({ $ref: "#/components/schemas/DebugResult" }) } },
    },
    "/api/v1/debug/{sourceKey}/comics/{comicId}/episodes/{episodeId}/pages": {
      get: { operationId: "debugEpisodePages", tags: ["debug"], parameters: [stringParam("sourceKey"), stringParam("comicId"), stringParam("episodeId")], responses: { "200": response({ $ref: "#/components/schemas/DebugResult" }) } },
    },
    "/api/v1/debug/{sourceKey}/image": {
      get: { operationId: "debugImage", tags: ["debug"], parameters: [stringParam("sourceKey"), queryParam("imageKey", true), queryParam("comicId"), queryParam("episodeId")], responses: { "200": response({ $ref: "#/components/schemas/DebugResult" }) } },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      veneraToken: { type: "apiKey", in: "header", name: "x-venera-token" },
    },
    responses: {
      Error: { description: "API error", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
    },
    schemas: {
      Ok: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      Health: { type: "object", properties: { ok: { type: "boolean" }, name: { type: "string" }, dataDir: { type: "string" }, proxy: { anyOf: [{ type: "string" }, { type: "null" }] }, noProxy: { type: "array", items: { type: "string" } } }, required: ["ok", "name", "dataDir", "noProxy"] },
      ApiError: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {}, requestId: { type: "string" } }, required: ["code", "message"] } }, required: ["error"] },
      RepositorySource: { type: "object", additionalProperties: true, properties: { key: { type: "string" }, name: { type: "string" }, version: { type: "string" }, url: { type: "string" }, filename: { type: "string" }, fileName: { type: "string" } } },
      SourceRepository: { type: "object", properties: { url: { type: "string" }, sources: { type: "array", items: { $ref: "#/components/schemas/RepositorySource" } } }, required: ["url", "sources"] },
      SourceSummary: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, version: { type: "string" }, url: { type: "string" }, filePath: { type: "string" }, hasSearch: { type: "boolean" }, hasComic: { type: "boolean" } }, required: ["key", "name"] },
      SourceMetadata: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, version: { type: "string" }, enabled: { type: "number" }, script_path: { type: "string" }, script_url: { type: "string" }, hash: { type: "string" }, installed_at: { type: "string" }, updated_at: { type: "string" } }, required: ["key", "name", "enabled"] },
      SourceSettings: { type: "object", properties: { schema: json, values: json }, required: ["schema", "values"] },
      Comic: { type: "object", additionalProperties: true, properties: { sourceKey: { type: "string" }, id: { type: "string" }, title: { type: "string" }, cover: { type: "string" }, subtitle: { type: "string" }, tags: { type: "array", items: { type: "string" } }, description: { type: "string" }, language: { type: "string" }, stars: { type: "number" } }, required: ["id", "title"] },
      SearchResult: { type: "object", properties: { comics: { type: "array", items: { $ref: "#/components/schemas/Comic" } }, maxPage: { type: "number" }, next: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: ["comics"] },
      AggregatedSearchItem: { type: "object", properties: { sourceKey: { type: "string" }, sourceName: { type: "string" }, result: { $ref: "#/components/schemas/SearchResult" }, error: { type: "string" } }, required: ["sourceKey", "sourceName"] },
      ComicDetails: { allOf: [{ $ref: "#/components/schemas/Comic" }, { type: "object", additionalProperties: true, properties: { comicId: { type: "string" }, chapters: { type: "object", additionalProperties: { type: "string" } }, thumbnails: { type: "array", items: { type: "string" } } } }] },
      EpisodePages: { type: "object", properties: { images: { type: "array", items: { type: "string" } } }, required: ["images"] },
      CreateDownloadRequest: { type: "object", properties: { sourceKey: { type: "string" }, comicId: { type: "string" }, episodeId: { type: "string" }, all: { type: "boolean" } }, required: ["sourceKey", "comicId"] },
      DownloadLog: { type: "object", properties: { time: { type: "string" }, phase: { type: "string" }, message: { type: "string" } }, required: ["time", "phase", "message"] },
      DownloadTask: { type: "object", additionalProperties: true, properties: { id: { type: "string" }, sourceKey: { type: "string" }, comicId: { type: "string" }, episodeId: { type: "string" }, all: { type: "boolean" }, title: { type: "string" }, status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"] }, phase: { type: "string" }, total: { type: "number" }, completed: { type: "number" }, error: { type: "string" }, current: { type: "string" }, outputDir: { type: "string" }, logs: { type: "array", items: { $ref: "#/components/schemas/DownloadLog" } }, createdAt: { type: "string" }, updatedAt: { type: "string" } }, required: ["id", "sourceKey", "comicId", "episodeId", "status", "phase", "total", "completed", "logs", "createdAt", "updatedAt"] },
      DownloadItem: { type: "object", properties: { id: { type: "string" }, task_id: { type: "string" }, image_key: { type: "string" }, file_path: { type: "string" }, status: { type: "string" }, retry_count: { type: "number" }, error: { type: "string" }, error_code: { type: "string" }, updated_at: { type: "string" } }, required: ["id", "task_id", "image_key", "status", "retry_count", "updated_at"] },
      HistoryItem: { type: "object", properties: { id: { type: "string" }, source_key: { type: "string" }, comic_id: { type: "string" }, episode_id: { type: "string" }, page: { type: "number" }, progress: { type: "number" }, updated_at: { type: "string" } }, required: ["id", "source_key", "comic_id", "page", "progress", "updated_at"] },
      CacheStats: { type: "object", properties: { files: { type: "number" }, bytes: { type: "number" } }, required: ["files", "bytes"] },
      RuntimeCompatibilityItem: { type: "object", properties: { area: { type: "string" }, api: { type: "string" }, status: { type: "string" }, note: { type: "string" } }, required: ["area", "api", "status"] },
      RuntimeDiagnostic: { type: "object", properties: { time: { type: "string" }, sourceKey: { type: "string" }, operation: { type: "string" }, code: { type: "string" }, message: { type: "string" } }, required: ["time", "operation", "code", "message"] },
      RuntimeDiagnostics: { type: "object", properties: { isolation: { type: "string" }, loadedSources: { type: "array", items: { $ref: "#/components/schemas/SourceSummary" } }, failedLoads: { type: "array", items: { $ref: "#/components/schemas/RuntimeDiagnostic" } }, recentErrors: { type: "array", items: { $ref: "#/components/schemas/RuntimeDiagnostic" } }, sourceConcurrency: { type: "array", items: { type: "object", properties: { sourceKey: { type: "string" }, active: { type: "number" }, queued: { type: "number" } }, required: ["sourceKey", "active", "queued"] } } }, required: ["isolation", "loadedSources", "failedLoads", "recentErrors", "sourceConcurrency"] },
      DebugResult: { type: "object", additionalProperties: true, properties: { ok: { type: "boolean" }, name: { type: "string" }, durationMs: { type: "number" }, summary: {}, error: { type: "string" }, hint: { type: "string" }, stack: { type: "array", items: { type: "string" } } }, required: ["ok", "name", "durationMs"] },
    },
  },
} as const;

export async function registerOpenApiRoutes(app: FastifyInstance) {
  app.get("/openapi.json", async () => openApiDocument);
}
