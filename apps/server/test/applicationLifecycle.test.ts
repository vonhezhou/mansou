import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
async function build() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mansou-app-lifecycle-"));
  directories.push(dataDir);
  const built = await buildApp(undefined, { ...readConfig(), dataDir });
  apps.push(built);
  return built;
}
describe("application lifecycle", () => {
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
    const built = await build();
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
      scriptPath: built.context.paths.bundledMockSource,
    });
    await built.context.sources.setEnabled("mock", false);
    expect(built.context.sources.get("other")).toBe(provider);
    await expect(provider.search({ keyword: "test" })).resolves.toMatchObject({ comics: [] });
    await built.context.sources.setEnabled("mock", true);
    expect(built.context.sources.get("other")).toBe(provider);
    expect(built.context.sources.list().map((source) => source.key)).toContain("mock");
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
