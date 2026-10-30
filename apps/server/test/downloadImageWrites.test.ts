import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SourceProvider, SourceRegistry } from "@mansou/core";
import { createStorage, type DownloadTask } from "@mansou/storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadRunner } from "../src/services/downloads/downloadRunner.js";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";
import { ImageProxyService } from "../src/services/imageProxy.js";
import { ImageCache } from "../src/storage/imageCache.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  writeFile: vi.fn(),
}));

let directory: string;
let storage: ReturnType<typeof createStorage>;
let cache: ImageCache;
let proxy: ImageProxyService;
let runner: DownloadRunner;
let actual: typeof fs;
const key = "https://images.test/page.jpg";
const data = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);
const loadImageBytes = vi.fn<SourceProvider["loadImageBytes"]>();
const task: DownloadTask = {
  id: "task",
  sourceKey: "source",
  comicId: "comic",
  episodeId: "chapter",
  status: "running",
  phase: "queued",
  total: 0,
  completed: 0,
  logs: [],
  createdAt: "now",
  updatedAt: "now",
};
beforeEach(async () => {
  actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.writeFile).mockReset().mockImplementation(actual.writeFile);
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "mansou-download-image-writes-"));
  storage = createStorage(directory);
  cache = new ImageCache(path.join(directory, "cache"), 0);
  loadImageBytes.mockReset().mockResolvedValue({ data, contentType: "image/jpeg" });
  const provider = {
    comicDetails: async () => ({ title: "Comic", chapters: { chapter: "Chapter" } }),
    comicPages: async () => ({ images: [key] }),
    loadImageBytes,
  };
  const sources = { get: () => provider } as unknown as SourceRegistry;
  proxy = new ImageProxyService(sources, cache);
  runner = new DownloadRunner(sources, proxy, new DownloadRepository(storage), {
    outputDir: path.join(directory, "downloads"),
    concurrency: 1,
    retries: 2,
  });
});
afterEach(async () => {
  storage.close();
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});
async function run() {
  await runner.run(task, new AbortController().signal, () => {});
  const record = storage.getDownloadItem(task.id, key)!;
  expect(record.status).toBe("completed");
  expect(await fs.readFile(record.file_path!)).toEqual(data);
}

it("writes a cold image only to the download directory", async () => {
  const write = vi.spyOn(cache, "write");
  await run();
  expect(loadImageBytes).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  expect(await cache.cacheStats()).toEqual({ files: 0, bytes: 0 });
});

it("reuses a preview's cache entry without another network request or cache write", async () => {
  await proxy.load({
    sourceKey: task.sourceKey,
    comicId: task.comicId,
    episodeId: task.episodeId,
    imageKey: key,
  });
  const write = vi.spyOn(cache, "write");
  await run();
  expect(loadImageBytes).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  expect(await cache.cacheStats()).toEqual({ files: 1, bytes: data.length });
});

it("reuses fetched bytes when a transient output-write failure requires retrying", async () => {
  let fail = true;
  vi.mocked(fs.writeFile).mockImplementation(async (...args) => {
    if (String(args[0]).endsWith(".jpg") && fail) {
      fail = false;
      throw Object.assign(new Error("temporary file write error"), { code: "EBUSY" });
    }
    return actual.writeFile(...args);
  });
  await run();
  expect(fail).toBe(false);
  expect(loadImageBytes).toHaveBeenCalledOnce();
  expect(
    vi.mocked(fs.writeFile).mock.calls.filter(([file]) => String(file).endsWith(".jpg")),
  ).toHaveLength(2);
  expect(await cache.cacheStats()).toEqual({ files: 0, bytes: 0 });
});

it("requests the upstream again when fetching the bytes fails before a successful retry", async () => {
  loadImageBytes.mockRejectedValueOnce(new Error("HTTP 503 upstream unavailable"));
  await run();
  expect(loadImageBytes).toHaveBeenCalledTimes(2);
  expect(await cache.cacheStats()).toEqual({ files: 0, bytes: 0 });
});
