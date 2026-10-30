import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TestSourceRuntime as SourceRuntime } from "./helpers/runtime.js";

describe("worker plugin isolation", () => {
  it("loads and invokes a source in a worker by default", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-worker-source-"));
    const sourceFile = path.join(dir, "worker_mock.js");
    await writeFile(
      sourceFile,
      `class WorkerMock extends ComicSource {
      key = "worker_mock";
      name = "Worker Mock";
      search = { load: async (keyword) => ({ comics: [{ id: keyword, title: (await Data.load("worker-key")).ok ? "From Worker" : "Missing Data", cover: "" }] }) };
      comic = {
        loadInfo: async (id) => ({ id, title: "Detail", cover: "", chapters: { one: "One" } }),
        loadEp: async () => ({ images: ["mock://worker/1"] }),
        onImageLoad: async (imageKey, comicId, epId) => ({ url: imageKey, headers: { referer: comicId + "/" + epId } })
      };
      async init() {
        await Data.save("worker-key", { ok: true });
      }
      getImageLoadingConfig = async (imageKey) => ({ url: imageKey, headers: { "x-root": "yes" } });
      getThumbnailLoadingConfig = async (imageKey) => ({ url: imageKey, headers: { "x-thumbnail": "yes" } });
      settings = { label: { default: "fallback" } };
      loadSettingValue = () => this.loadSetting("label");
      loadDataValue = async () => Data.load("worker-key");
    }`,
      "utf8",
    );

    const runtime = new SourceRuntime();
    await runtime.loadScript(sourceFile);
    expect(runtime.all()[0]).toMatchObject({ key: "worker_mock", hasSearch: true, hasComic: true });
    expect((await runtime.search("worker_mock", "hello")).comics[0]).toMatchObject({
      id: "hello",
      title: "From Worker",
    });
    expect((await runtime.comicDetails("worker_mock", "comic-1")).title).toBe("Detail");
    expect((await runtime.comicPages("worker_mock", "comic-1", "one")).images).toEqual([
      "mock://worker/1",
    ]);
    expect(runtime.searchOptions("worker_mock")).toEqual([]);
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(request.headers));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const imageKey = `http://127.0.0.1:${(server.address() as AddressInfo).port}/image`;
      const source = runtime.get("worker_mock");
      const image = await source.loadImageBytes({ imageKey, comicId: "comic-1", episodeId: "one" });
      expect(JSON.parse(Buffer.from(image.data).toString())).toMatchObject({
        referer: "comic-1/one",
      });
      const thumb = await source.loadImageBytes({ imageKey, thumbnail: true });
      expect(JSON.parse(Buffer.from(thumb.data).toString())).toMatchObject({
        "x-thumbnail": "yes",
      });
    } finally {
      await runtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
