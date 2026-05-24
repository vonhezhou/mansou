import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/config/config.js";
import { SourceRuntime } from "../src/runtime/sourceRuntime.js";

const originalIsolation = config.pluginIsolation;

afterEach(() => {
  config.pluginIsolation = originalIsolation;
});

describe("worker plugin isolation", () => {
  it("loads and invokes a source in a worker when enabled", async () => {
    config.pluginIsolation = "worker";
    const dir = await mkdtemp(path.join(os.tmpdir(), "venera-worker-source-"));
    const sourceFile = path.join(dir, "worker_mock.js");
    await writeFile(sourceFile, `class WorkerMock extends ComicSource {
      key = "worker_mock";
      name = "Worker Mock";
      search = { load: async (keyword) => ({ comics: [{ id: keyword, title: "From Worker", cover: "" }] }) };
      comic = {
        loadInfo: async (id) => ({ id, title: "Detail", cover: "", chapters: { one: "One" } }),
        loadEp: async () => ({ images: ["mock://worker/1"] })
      };
    }`, "utf8");

    const runtime = new SourceRuntime();
    await runtime.loadScript(sourceFile);
    expect(runtime.all()[0]).toMatchObject({ key: "worker_mock", hasSearch: true, hasComic: true });
    expect((await runtime.search("worker_mock", "hello")).comics[0]).toMatchObject({ id: "hello", title: "From Worker" });
    expect((await runtime.comicDetails("worker_mock", "comic-1")).title).toBe("Detail");
    expect((await runtime.comicPages("worker_mock", "comic-1", "one")).images).toEqual(["mock://worker/1"]);
  });
});
