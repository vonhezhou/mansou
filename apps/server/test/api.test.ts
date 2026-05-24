import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let context: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>["context"];
let buildApp: typeof import("../src/app.js").buildApp;
let initializeApp: typeof import("../src/app.js").initializeApp;

beforeAll(async () => {
  process.env.VENERA_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "venera-web-test-"));
  const module = await import("../src/app.js");
  buildApp = module.buildApp;
  initializeApp = module.initializeApp;
  const built = await buildApp();
  app = built.app;
  context = built.context;
  await initializeApp(context);
});

afterAll(async () => {
  await app.close();
});

describe("api v1 mock source", () => {
  it("returns health status", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, name: "venera_web" });
  });

  it("returns runtime compatibility report", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/debug/runtime/compatibility" });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toContainEqual(expect.objectContaining({ area: "Network", api: "fetchBytes" }));
  });

  it("returns runtime diagnostics and classified plugin errors", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/v1/search/missing?keyword=test" });
    expect(missing.statusCode).toBe(500);
    expect(missing.json().error.code).toBe("SOURCE_NOT_LOADED");

    const diagnostics = await app.inject({ method: "GET", url: "/api/v1/debug/runtime/diagnostics" });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json().loadedSources).toEqual(expect.any(Array));
    expect(diagnostics.json().sourceConcurrency).toEqual(expect.any(Array));
  });

  it("returns a client-generatable OpenAPI document", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ openapi: "3.1.0" });
    expect(response.json().paths["/api/v1/search/{sourceKey}"].get.operationId).toBe("searchSource");
    expect(response.json().paths["/api/v1/comics/{sourceKey}/detail"].get.operationId).toBe("getComicDetailsByQuery");
    expect(response.json().paths["/api/v1/debug/runtime/diagnostics"].get.operationId).toBe("getRuntimeDiagnostics");
    expect(response.json().components.schemas.DownloadTask).toBeTruthy();
  });

  it("searches, loads details, pages, and image bytes", async () => {
    const search = await app.inject({ method: "GET", url: "/api/v1/search/mock?keyword=test&page=1" });
    expect(search.statusCode).toBe(200);
    const searchBody = search.json();
    expect(searchBody.comics[0]).toMatchObject({ id: "mock-comic-1", title: "Mock test 1" });

    const details = await app.inject({ method: "GET", url: "/api/v1/comics/mock/mock-comic-1" });
    expect(details.statusCode).toBe(200);
    expect(details.json()).toMatchObject({ title: "Mock Comic mock-comic-1" });

    const pages = await app.inject({ method: "GET", url: "/api/v1/comics/mock/mock-comic-1/episodes/chapter-1/pages" });
    expect(pages.statusCode).toBe(200);
    expect(pages.json().images).toHaveLength(5);

    const image = await app.inject({
      method: "GET",
      url: "/api/v1/image?sourceKey=mock&imageKey=mock%3A%2F%2Fimage%2Fmock-comic-1%2Fchapter-1%2F1",
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/svg+xml");
  });

  it("returns unified validation errors", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/search/mock" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(response.json().error.requestId).toBeTruthy();
  });

  it("persists source settings in sqlite across app restarts", async () => {
    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/sources/mock/settings",
      payload: { values: { resultCount: 2 } },
    });
    expect(update.statusCode).toBe(200);

    await app.close();
    const built = await buildApp();
    app = built.app;
    context = built.context;
    await initializeApp(context);

    const settings = await app.inject({ method: "GET", url: "/api/v1/sources/mock/settings" });
    expect(settings.statusCode).toBe(200);
    expect(settings.json().values).toMatchObject({ resultCount: 2 });
  });

  it("stores source metadata and supports enable toggles", async () => {
    context.storage.upsertSource({ key: "mock", name: "Mock", version: "1.0.0", scriptPath: "mock.js", enabled: true });
    const metadataBefore = await app.inject({ method: "GET", url: "/api/v1/sources/metadata" });
    expect(metadataBefore.statusCode).toBe(200);
    expect(metadataBefore.json()).toContainEqual(expect.objectContaining({ key: "mock", enabled: 1 }));

    const disable = await app.inject({ method: "PUT", url: "/api/v1/sources/mock/enabled", payload: { enabled: false } });
    expect(disable.statusCode).toBe(200);
    expect(disable.json()).toMatchObject({ key: "mock", enabled: 0 });

    const sources = await app.inject({ method: "GET", url: "/api/v1/sources" });
    expect(sources.json().some((source: { key: string }) => source.key === "mock")).toBe(false);

    const enable = await app.inject({ method: "PUT", url: "/api/v1/sources/mock/enabled", payload: { enabled: true } });
    expect(enable.statusCode).toBe(200);
  });

  it("stores reading history and reports cache stats", async () => {
    const history = await app.inject({
      method: "PUT",
      url: "/api/v1/library/history/mock/mock-comic-1",
      payload: { episodeId: "chapter-1", page: 2, progress: 0.4 },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({ source_key: "mock", comic_id: "mock-comic-1", episode_id: "chapter-1", page: 2 });

    const cache = await app.inject({ method: "GET", url: "/api/v1/settings/cache" });
    expect(cache.statusCode).toBe(200);
    expect(cache.json()).toMatchObject({ files: expect.any(Number), bytes: expect.any(Number) });
  });

  it("persists per-image download items", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      payload: { sourceKey: "mock", comicId: "mock-comic-resume", episodeId: "chapter-1" },
    });
    expect(created.statusCode).toBe(200);
    const taskId = created.json().id as string;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const task = await app.inject({ method: "GET", url: `/api/v1/downloads/${taskId}` });
      if (task.json().status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const items = await app.inject({ method: "GET", url: `/api/v1/downloads/${taskId}/items` });
    expect(items.statusCode).toBe(200);
    expect(items.json()).toHaveLength(5);
    expect(items.json()[0]).toMatchObject({ task_id: taskId, status: "completed" });

    const retry = await app.inject({
      method: "POST",
      url: `/api/v1/downloads/${taskId}/items/retry`,
      payload: { imageKey: items.json()[0].image_key },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().item).toMatchObject({ task_id: taskId, status: "completed" });
  });
});
