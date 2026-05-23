import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let buildApp: typeof import("../src/app.js").buildApp;
let initializeApp: typeof import("../src/app.js").initializeApp;

beforeAll(async () => {
  process.env.VENERA_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "venera-web-test-"));
  const module = await import("../src/app.js");
  buildApp = module.buildApp;
  initializeApp = module.initializeApp;
  const built = await buildApp();
  app = built.app;
  await initializeApp(built.context);
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
    await initializeApp(built.context);

    const settings = await app.inject({ method: "GET", url: "/api/v1/sources/mock/settings" });
    expect(settings.statusCode).toBe(200);
    expect(settings.json().values).toMatchObject({ resultCount: 2 });
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
});
