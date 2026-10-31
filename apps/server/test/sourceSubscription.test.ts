import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { SourceRepositoryService } from "../src/repositories/sourceRepository.js";
import { registerSourceRepositoryRoutes } from "../src/routes/sourceRepository.js";
import { createPaths } from "../src/storage/paths.js";

let directory: string;
const defaults = {
  sourceListUrl: "https://default.example/index.json",
  sourceCdnBaseUrl: "https://default-cdn.example/",
};
const sources = [{ name: "测试源", key: "same", version: "1.0.0", fileName: "test.js" }];
const fetcher = vi.fn<typeof fetch>();
let repository: SourceRepositoryService;
const custom = { name: "自定义订阅", url: "https://custom.example/index.json", cdnBaseUrl: "" };
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-subscriptions-"));
  fetcher.mockReset().mockImplementation(async () => Response.json(sources));
  repository = new SourceRepositoryService(defaults, createPaths(directory), fetcher);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("persists stable IDs across edits/restarts and permits the same original source key across subscriptions", async () => {
  await repository.resetRepository();
  const created = await repository.createRepository(custom);
  expect(created.sources.map((source) => source.originalKey)).toEqual(["same", "same"]);
  expect(new Set(created.sources.map((source) => source.key)).size).toBe(2);
  const id = created.subscriptions.find((s) => s.name === custom.name)!.id;
  const edited = await repository.updateRepository(
    { ...custom, name: "改名", url: "https://moved.example/index.json" },
    id,
  );
  expect(edited.subscriptions.find((s) => s.id === id)?.name).toBe("改名");
  const restarted = new SourceRepositoryService(defaults, createPaths(directory), fetcher);
  expect(await restarted.getRepository()).toEqual(edited);
  await expect(
    repository.createRepository({ ...custom, url: "https://moved.example/index.json" }),
  ).rejects.toThrow("该订阅地址已添加");
});

it.each([
  () => Promise.reject(new Error("network failure")),
  async () => new Response("unavailable", { status: 503 }),
  async () => Response.json({ invalid: true }),
  async () => Response.json([{ name: "invalid" }]),
])("preserves saved subscriptions when validation fails", async (failure) => {
  const original = await repository.resetRepository();
  fetcher.mockImplementation(failure);
  await expect(repository.updateRepository(custom, "default")).rejects.toThrow();
  expect(await repository.getRepository()).toEqual(original);
});

it("refreshes independently, keeps failed subscription caches and skips disabled subscriptions", async () => {
  await repository.resetRepository();
  let state = await repository.createRepository(custom);
  const id = state.subscriptions.find((s) => s.id !== "default")!.id;
  fetcher.mockImplementation(async (input) => {
    if (String(input) === custom.url) throw new Error("custom offline");
    return Response.json([{ ...sources[0], version: "2.0.0" }]);
  });
  await repository.refreshRepository();
  state = await repository.getRepository();
  expect(state.sources.find((s) => s.subscriptionId === "default")?.version).toBe("2.0.0");
  expect(state.sources.find((s) => s.subscriptionId === id)?.version).toBe("1.0.0");
  expect(state.subscriptions.find((s) => s.id === id)?.error).toBe("custom offline");
  await repository.updateRepository({ ...custom, enabled: false }, id);
  fetcher.mockClear();
  await repository.refreshRepository();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await repository.getRepository()).sources).toHaveLength(1);
});

it("restores only defaults, preserves other IDs and scripts, and does not change state on reset failure", async () => {
  await repository.updateRepository(custom, "default");
  const state = await repository.createRepository({
    ...custom,
    url: "https://another.example/index.json",
  });
  const id = state.subscriptions.find((s) => s.id !== "default")!.id;
  const scripts = createPaths(directory).scripts;
  await mkdir(scripts, { recursive: true });
  await writeFile(path.join(scripts, "installed.js"), "installed script");
  const restored = await repository.resetRepository();
  expect(restored.subscriptions.find((s) => s.id === "default")).toMatchObject({
    url: defaults.sourceListUrl,
    cdnBaseUrl: defaults.sourceCdnBaseUrl,
  });
  expect(restored.subscriptions.some((s) => s.id === id)).toBe(true);
  expect(await readFile(path.join(scripts, "installed.js"), "utf8")).toBe("installed script");
  fetcher.mockRejectedValueOnce(new Error("default offline"));
  await expect(repository.resetRepository()).rejects.toThrow("default offline");
  expect(await repository.getRepository()).toEqual(restored);
});

it("serializes overlapping changes and prevents a refresh from reviving a removed subscription", async () => {
  const state = await repository.createRepository(custom);
  const id = state.subscriptions.find((s) => s.id !== "default")!.id;
  const refreshed = repository.refreshRepository();
  const deleted = repository.deleteRepository(id);
  await Promise.all([refreshed, deleted]);
  expect((await repository.getRepository()).subscriptions.some((s) => s.id === id)).toBe(false);
});

it("routes creation/edit/delete/reset and rejects unsupported URLs before fetching", async () => {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) =>
    reply.code(error instanceof ZodError ? 400 : 500).send({ message: error.message }),
  );
  await registerSourceRepositoryRoutes(app, { repository });
  try {
    for (const payload of [
      { ...custom, url: "file:///tmp/index.json" },
      { ...custom, cdnBaseUrl: "ftp://example.com" },
      { ...custom, name: "" },
    ])
      expect(
        (await app.inject({ method: "POST", url: "/source-repository", payload })).statusCode,
      ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    const added = await app.inject({ method: "POST", url: "/source-repository", payload: custom });
    expect(added.statusCode).toBe(200);
    const id = added.json().subscriptions.find((s: { id: string }) => s.id !== "default").id;
    const edited = await app.inject({
      method: "PUT",
      url: `/source-repository/${id}`,
      payload: { ...custom, name: "新名字" },
    });
    expect(edited.json().subscriptions.find((s: { id: string }) => s.id === id).name).toBe(
      "新名字",
    );
    expect(
      (await app.inject({ method: "DELETE", url: `/source-repository/${id}` })).json()
        .subscriptions,
    ).toHaveLength(1);
    const reset = await app.inject({ method: "POST", url: "/source-repository/reset" });
    expect(reset.json().subscriptions[0].url).toBe(defaults.sourceListUrl);
  } finally {
    await app.close();
  }
});
