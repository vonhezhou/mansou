import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "../src/config/config.js";

let app: FastifyInstance;
let context: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>["context"];
let testServer: Server;
let baseUrl: string;

const originalDataDir = config.dataDir;
const originalIsolation = config.pluginIsolation;

beforeAll(async () => {
  testServer = createServer((request, response) => {
    if (request.url === "/cookie") {
      response.end(request.headers.cookie ?? "");
      return;
    }
    if (request.url === "/error") {
      response.statusCode = 403;
      response.end("forbidden");
      return;
    }
    response.setHeader("content-type", "image/png");
    response.end(Buffer.from([1, 2, 3]));
  });
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const address = testServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  config.dataDir = await mkdtemp(path.join(os.tmpdir(), "venera-web-worker-api-test-"));
  config.pluginIsolation = "worker";
  const module = await import("../src/app.js");
  const built = await module.buildApp();
  app = built.app;
  context = built.context;
  await module.initializeApp(context);
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
  config.dataDir = originalDataDir;
  config.pluginIsolation = originalIsolation;
});

describe("api v1 mock source with worker isolation", () => {
  it("searches, loads details, pages, image bytes, and downloads", async () => {
    const diagnostics = await app.inject({ method: "GET", url: "/api/v1/debug/runtime/diagnostics" });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json()).toMatchObject({ isolation: "worker" });

    const search = await app.inject({ method: "GET", url: "/api/v1/search/mock?keyword=test&page=1" });
    expect(search.statusCode).toBe(200);
    expect(search.json().comics[0]).toMatchObject({ id: "mock-comic-1", title: "Mock test 1" });

    const details = await app.inject({ method: "GET", url: "/api/v1/comics/mock/mock-comic-1" });
    expect(details.statusCode).toBe(200);
    expect(details.json()).toMatchObject({ title: "Mock Comic mock-comic-1" });

    const pages = await app.inject({ method: "GET", url: "/api/v1/comics/mock/mock-comic-1/episodes/chapter-1/pages" });
    expect(pages.statusCode).toBe(200);
    expect(pages.json().images).toHaveLength(5);

    const image = await app.inject({
      method: "GET",
      url: "/api/v1/image?sourceKey=mock&comicId=mock-comic-1&episodeId=chapter-1&imageKey=mock%3A%2F%2Fimage%2Fmock-comic-1%2Fchapter-1%2F1",
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/svg+xml");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      payload: { sourceKey: "mock", comicId: "mock-comic-worker", episodeId: "chapter-1" },
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
  });

  it("keeps cookies, data and settings consistent across worker reloads", async () => {
    const settings = await app.inject({
      method: "PUT",
      url: "/api/v1/sources/mock/settings",
      payload: { values: { resultCount: 2, cookieEchoUrl: `${baseUrl}/cookie` } },
    });
    expect(settings.statusCode).toBe(200);

    const cookies = await app.inject({
      method: "PUT",
      url: "/api/v1/sources/mock/cookies",
      payload: { url: baseUrl, cookies: ["session=worker"] },
    });
    expect(cookies.statusCode).toBe(200);

    const cookieCheck = await app.inject({ method: "GET", url: "/api/v1/search/mock?keyword=cookie-check&page=1" });
    expect(cookieCheck.statusCode).toBe(200);
    expect(cookieCheck.json().comics[0].title).toContain("session=worker");

    const dataSave = await app.inject({ method: "GET", url: "/api/v1/search/mock?keyword=data-save&page=1" });
    expect(dataSave.statusCode).toBe(200);
    expect(dataSave.json().comics[0].title).toBe("saved");

    await context.runtime.loadInstalled();
    const dataRead = await app.inject({ method: "GET", url: "/api/v1/search/mock?keyword=data-read&page=1" });
    expect(dataRead.statusCode).toBe(200);
    expect(dataRead.json().comics[0].title).toBe("saved");

    const settingCheck = await app.inject({ method: "GET", url: "/api/v1/search/mock?keyword=test&page=1" });
    expect(settingCheck.statusCode).toBe(200);
    expect(settingCheck.json().comics).toHaveLength(2);
  });

  it("supports minimal image loading hooks in worker isolation", async () => {
    const settings = await app.inject({
      method: "PUT",
      url: "/api/v1/sources/mock/settings",
      payload: { values: { imageFallbackUrl: `${baseUrl}/image`, imageErrorUrl: `${baseUrl}/error` } },
    });
    expect(settings.statusCode).toBe(200);

    const fallback = await app.inject({ method: "GET", url: "/api/v1/image?sourceKey=mock&imageKey=hook%3A%2F%2Ffallback" });
    expect(fallback.statusCode).toBe(200);
    expect(Buffer.from(fallback.body).toString("hex")).toBe("010203");

    const response = await app.inject({ method: "GET", url: "/api/v1/image?sourceKey=mock&imageKey=hook%3A%2F%2Fresponse" });
    expect(response.statusCode).toBe(200);
    expect(Buffer.from(response.body).toString("hex")).toBe("010203");

    const modified = await app.inject({ method: "GET", url: "/api/v1/image?sourceKey=mock&imageKey=hook%3A%2F%2Fmodify" });
    expect(modified.statusCode).toBe(200);
    expect(Buffer.from(modified.body).toString("hex")).toBe("030201");
  });
});
