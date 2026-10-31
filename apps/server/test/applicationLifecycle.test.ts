import { installMockSource, mockSourceFile } from "./helpers/mockSource.js";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, initializeApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map(({ app }) => app.close()));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function build(withMock = true) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mansou-app-lifecycle-"));
  directories.push(dataDir);
  const built = await buildApp(undefined, { ...readConfig(), dataDir });
  apps.push(built);
  if (withMock) await installMockSource(built.context);
  return built;
}
describe("application lifecycle", () => {
  it("starts without test sources and does not inject them on reload", async () => {
    const built = await build(false);
    await initializeApp(built.context);
    expect(built.context.sources.all()).toEqual([]);
    expect(await built.context.sources.metadata()).toEqual([]);
    await built.context.sources.loadInstalled();
    expect(built.context.sources.all()).toEqual([]);
  });
  it("isolates paths and storage across application instances", async () => {
    const first = await build();
    const second = await build();
    await Promise.all([initializeApp(first.context), initializeApp(second.context)]);
    first.context.downloads.create({ sourceKey: "mock", comicId: "isolated" });
    expect(second.context.downloads.all()).toEqual([]);
    expect(first.context.paths.downloads).not.toBe(second.context.paths.downloads);
    await first.app.close();
    expect(
      (await second.context.search.search("mock", "still alive")).comics.length,
    ).toBeGreaterThan(0);
  });
  it("releases resources when initialization fails", async () => {
    const built = await build(false);
    const close = vi.spyOn(built.context.storage, "close");
    await writeFile(built.context.paths.scripts, "not a directory").catch(async () => {
      await mkdir(path.dirname(built.context.paths.scripts), { recursive: true });
      await writeFile(built.context.paths.scripts, "not a directory");
    });
    await expect(initializeApp(built.context)).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    await built.app.close();
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not reload other sources when toggling one source", async () => {
    const built = await build();
    await initializeApp(built.context);
    const script = path.join(built.context.paths.scripts, "other.js");
    await writeFile(
      script,
      `class Other extends ComicSource {
      key = "other"; name = "Other";
      search = { load: async () => ({ comics: [] }) };
    }`,
    );
    await built.context.sources.loadScript(script);
    const provider = built.context.sources.get("other");
    built.context.storage.upsertSource({
      key: "mock",
      name: "Mock",
      scriptPath: mockSourceFile,
    });
    await built.context.sources.setEnabled("mock", false);
    expect(built.context.sources.get("other")).toBe(provider);
    await expect(provider.search({ keyword: "test" })).resolves.toMatchObject({ comics: [] });
    await built.context.sources.setEnabled("mock", true);
    expect(built.context.sources.get("other")).toBe(provider);
    expect(built.context.sources.list().map((source) => source.key)).toContain("mock");
  });
  it("uninstalls enabled and disabled sources without removing downloads or restoring them on reload", async () => {
    const built = await build();
    await initializeApp(built.context);
    const { sources, storage, paths } = built.context;
    const script = path.join(paths.scripts, "removable.js");
    const install = async () => {
      await writeFile(
        script,
        'class Removable extends ComicSource { key = "removable"; name = "Removable"; }',
      );
      await sources.loadScript(script);
      storage.upsertSource({ key: "removable", name: "Removable", scriptPath: script });
      storage.setSourceSettings("removable", { region: "cn" });
      storage.setPluginData("removable", "account", ["user", "secret"]);
      storage.setCookieJar("removable", { cookies: [] });
    };
    for (const disabled of [false, true]) {
      await install();
      if (disabled) await sources.setEnabled("removable", false);
      expect(
        (await sources.metadata()).find((source) => source.key === "removable")?.canUninstall,
      ).toBe(true);
      const response = await built.app.inject({
        method: "DELETE",
        url: "/api/v1/sources/removable",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      await expect(access(script)).rejects.toThrow();
      expect(storage.getSource("removable")).toBeNull();
      expect(storage.getSourceSettings("removable")).toEqual({});
      expect(storage.getPluginData("removable", "account")).toBeUndefined();
      expect(storage.getCookieJar("removable")).toBeNull();
      await sources.loadInstalled();
      expect(sources.list().some((source) => source.key === "removable")).toBe(false);
    }
    const missing = await built.app.inject({ method: "DELETE", url: "/api/v1/sources/removable" });
    expect(missing.statusCode).toBe(404);
  });
  it("protects running downloads and bundled scripts during source uninstall", async () => {
    const built = await build();
    await initializeApp(built.context);
    const { sources, storage, paths } = built.context;
    storage.upsertSource({ key: "mock", name: "Mock", scriptPath: mockSourceFile });
    const builtin = await built.app.inject({ method: "DELETE", url: "/api/v1/sources/mock" });
    expect(builtin.statusCode).toBe(409);
    expect(builtin.json().error.code).toBe("SOURCE_BUILTIN");
    expect(sources.list().some((source) => source.key === "mock")).toBe(true);
    const script = path.join(paths.scripts, "busy.js");
    await writeFile(script, 'class Busy extends ComicSource { key = "busy"; name = "Busy"; }');
    await sources.loadScript(script);
    storage.upsertSource({ key: "busy", name: "Busy", scriptPath: script });
    storage.saveDownload({
      id: "retained",
      sourceKey: "busy",
      comicId: "comic",
      episodeId: "",
      logs: [],
      createdAt: "2026-10-30T00:00:00Z",
      updatedAt: "2026-10-30T00:00:00Z",
      status: "running",
      phase: "queued",
      total: 0,
      completed: 0,
    });
    const busy = await built.app.inject({ method: "DELETE", url: "/api/v1/sources/busy" });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe("DOWNLOAD_BUSY");
    await expect(access(script)).resolves.toBeUndefined();
    storage.saveDownload({ ...storage.listDownloads()[0], status: "completed" });
    const removed = await built.app.inject({ method: "DELETE", url: "/api/v1/sources/busy" });
    expect(removed.statusCode).toBe(200);
    expect(storage.listDownloads()).toHaveLength(1);
    expect(storage.listDownloads()[0].id).toBe("retained");
  });
  it("registers discovered script metadata while preserving disabled sources and repository provenance", async () => {
    const built = await build();
    const { sources, storage, paths } = built.context;
    await initializeApp(built.context);
    const file = path.join(paths.scripts, "different-filename.js");
    await writeFile(
      file,
      'class Discovered extends ComicSource { key = "discovered"; name = "Discovered"; version = "1.2.0"; }',
    );
    await sources.loadInstalled();
    expect(storage.getSource("discovered")).toMatchObject({
      name: "Discovered",
      version: "1.2.0",
      enabled: 1,
      script_path: file,
    });
    expect(
      (await sources.metadata())
        .filter((source) => source.enabled)
        .map((source) => source.key)
        .sort(),
    ).toEqual(
      sources
        .all()
        .map((source) => source.key)
        .sort(),
    );
    storage.upsertSource({
      key: "discovered",
      name: "Discovered",
      scriptPath: file,
      scriptUrl: "https://example.test/original.js",
      hash: "original",
    });
    await sources.loadInstalled();
    expect(storage.getSource("discovered")).toMatchObject({
      script_url: "https://example.test/original.js",
      hash: "original",
    });
    await sources.setEnabled("discovered", false);
    await sources.loadInstalled();
    expect(storage.getSource("discovered")?.enabled).toBe(0);
    expect(sources.all().some((source) => source.key === "discovered")).toBe(false);
  });
  it.each([NaN, Infinity, 0, -1, 1.5])(
    "rejects invalid concurrency %s before allocating resources",
    async (downloadTaskConcurrency) => {
      await expect(
        buildApp(undefined, { ...readConfig(), downloadTaskConcurrency }),
      ).rejects.toThrow("downloadTaskConcurrency");
    },
  );
});
