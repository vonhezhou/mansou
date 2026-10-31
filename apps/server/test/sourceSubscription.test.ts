import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { SourceRepositoryService } from "../src/repositories/sourceRepository.js";
import { registerSourceRepositoryRoutes } from "../src/routes/sourceRepository.js";
import { createPaths } from "../src/storage/paths.js";

let directory: string;
const defaults = { sourceListUrl: "https://default.example/index.json", sourceCdnBaseUrl: "" };
const sources = [{ name: "测试源", key: "test", version: "1.0.0", fileName: "test.js" }];
const fetcher = vi.fn<typeof fetch>();
let repository: SourceRepositoryService;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-subscription-"));
  fetcher.mockReset().mockImplementation(async () => Response.json(sources));
  repository = new SourceRepositoryService(defaults, createPaths(directory), fetcher);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("persists the subscription and index together and uses it after restarting", async () => {
  expect(await repository.getRepository()).toEqual({
    url: defaults.sourceListUrl,
    cdnBaseUrl: "",
    sources: [],
  });
  const settings = {
    url: "https://custom.example/sources/index.json",
    cdnBaseUrl: "https://cdn.example/scripts/",
  };
  await repository.updateRepository(settings);
  const restarted = new SourceRepositoryService(defaults, createPaths(directory), fetcher);
  expect(await restarted.getRepository()).toEqual({ ...settings, sources });
  await restarted.refreshRepository();
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(settings.url);
  fetcher.mockImplementation(async (url) =>
    String(url).endsWith(".js")
      ? new Response("class Test extends ComicSource {}")
      : Response.json(sources),
  );
  expect((await restarted.installSource("test")).scriptUrl).toBe(
    "https://cdn.example/scripts/test.js",
  );
  await restarted.updateRepository({ ...settings, cdnBaseUrl: "" });
  expect((await restarted.installSource("test")).scriptUrl).toBe(
    "https://custom.example/sources/test.js",
  );
});

it.each([
  () => Promise.reject(new Error("network failure")),
  async () => new Response("unavailable", { status: 503 }),
  async () => Response.json({ invalid: true }),
  async () => Response.json([{ name: "invalid" }]),
])("keeps the saved subscription and list when validation or download fails", async (failure) => {
  await repository.updateRepository({ url: defaults.sourceListUrl, cdnBaseUrl: "" });
  const previous = await repository.getRepository();
  fetcher.mockImplementation(failure);
  await expect(
    repository.updateRepository({ url: "https://broken.example/index.json", cdnBaseUrl: "" }),
  ).rejects.toThrow();
  expect(await repository.getRepository()).toEqual(previous);
});

it("does not let an overlapping refresh restore the previous subscription", async () => {
  let release!: (response: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const saved = repository.updateRepository({
    url: "https://new.example/index.json",
    cdnBaseUrl: "",
  });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const refreshed = repository.refreshRepository();
  release(Response.json(sources));
  await Promise.all([saved, refreshed]);
  expect((await repository.getRepository()).url).toBe("https://new.example/index.json");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "https://new.example/index.json",
    "https://new.example/index.json",
  ]);
});

it("validates HTTP subscription settings through the route before fetching", async () => {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) =>
    reply.code(error instanceof ZodError ? 400 : 500).send({ message: error.message }),
  );
  await registerSourceRepositoryRoutes(app, { repository });
  try {
    for (const payload of [
      { url: "file:///tmp/index.json", cdnBaseUrl: "" },
      { url: defaults.sourceListUrl, cdnBaseUrl: "ftp://example.com/" },
      { url: "", cdnBaseUrl: "" },
    ]) {
      expect(
        (await app.inject({ method: "PUT", url: "/source-repository", payload })).statusCode,
      ).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "PUT",
      url: "/source-repository",
      payload: { url: " https://custom.example/index.json ", cdnBaseUrl: "" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: "https://custom.example/index.json",
      cdnBaseUrl: "",
      sources,
    });
    expect((await app.inject("/source-repository")).json()).toEqual(response.json());
  } finally {
    await app.close();
  }
});
