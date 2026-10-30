import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SourceProvider, SourceRegistry } from "@venera/core";
import { createStorage, type DownloadTask } from "@venera/storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";
import { DownloadRunner } from "../src/services/downloads/downloadRunner.js";
import { DownloadService } from "../src/services/downloads/downloadService.js";
import type { ImageProxyService } from "../src/services/imageProxy.js";

let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: DownloadRepository;
let runner: DownloadRunner;
let service: DownloadService;
const task: DownloadTask = {
  id: "task",
  sourceKey: "source",
  comicId: "comic",
  episodeId: "__all__",
  all: true,
  status: "paused",
  phase: "paused",
  total: 4,
  completed: 0,
  logs: [],
  createdAt: "2026-10-30T00:00:00Z",
  updatedAt: "2026-10-30T00:00:00Z",
};
const details = vi.fn<SourceProvider["comicDetails"]>();
const pages = vi.fn<SourceProvider["comicPages"]>();
const loadBytes = vi.fn<ImageProxyService["loadBytes"]>();

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "venera-retry-"));
  storage = createStorage(directory);
  repository = new DownloadRepository(storage);
  repository.save(task);
  for (const imageKey of ["a1", "a2", "b1", "b2"])
    repository.saveItem({ taskId: task.id, imageKey, status: "failed" });
  details.mockResolvedValue({
    comicId: "comic",
    sourceKey: "source",
    title: "Comic",
    cover: "",
    chapters: { a: "First", b: "Second" },
  });
  pages.mockImplementation(async (_comicId, episodeId) => ({
    images: episodeId === "a" ? ["a1", "a2"] : ["b1", "b2"],
  }));
  loadBytes.mockImplementation(async (input) => ({
    data: Buffer.from(input.imageKey),
    contentType: "image/jpeg",
    cached: false,
  }));
  const sources: SourceRegistry = {
    get: () => ({ comicDetails: details, comicPages: pages }) as unknown as SourceProvider,
    list: () => [],
  };
  runner = new DownloadRunner(sources, { loadBytes }, repository, {
    outputDir: directory,
    concurrency: 1,
    retries: 1,
  });
  service = new DownloadService(repository, runner, 1, vi.fn());
});
afterEach(async () => {
  await service.close();
  storage.close();
  await rm(directory, { recursive: true, force: true });
  vi.resetAllMocks();
});

it("reuses details and chapter indices within a retry batch while preserving file positions", async () => {
  const result = await service.retryFailedImages(task.id);
  expect(result).toMatchObject({ retried: 4, task: { completed: 4 } });
  expect(result!.results.every((item) => item.ok)).toBe(true);
  expect(details).toHaveBeenCalledOnce();
  expect(pages).toHaveBeenCalledTimes(2);
  for (const [imageKey, chapter, file] of [
    ["a1", "First", "0001.jpg"],
    ["a2", "First", "0002.jpg"],
    ["b1", "Second", "0001.jpg"],
    ["b2", "Second", "0002.jpg"],
  ]) {
    const item = repository.item(task.id, imageKey)!;
    expect(item.file_path).toBe(path.join(directory, "source", "Comic_comic", chapter, file));
    expect((await readFile(item.file_path!)).toString()).toBe(imageKey);
  }
  repository.saveItem({ taskId: task.id, imageKey: "b2", status: "failed" });
  await service.retryFailedImages(task.id);
  expect(details).toHaveBeenCalledTimes(2);
  expect(pages).toHaveBeenCalledTimes(4);
});

it.each(["details", "pages"])(
  "does not cache a failed %s request for later images in the same batch",
  async (boundary) => {
    (boundary === "details" ? details : pages).mockRejectedValueOnce(
      new Error("temporary upstream error"),
    );
    const result = await service.retryFailedImages(task.id);
    expect(result!.results.map((item) => item.ok)).toEqual([false, true, true, true]);
    expect(result!.task?.completed).toBe(3);
    expect(details).toHaveBeenCalledTimes(boundary === "details" ? 2 : 1);
    expect(pages).toHaveBeenCalledTimes(boundary === "pages" ? 3 : 2);
    await service.retryFailedImages(task.id);
    expect(repository.item(task.id, "a1")?.status).toBe("completed");
  },
);

it("stops before downloading when cancelled during chapter loading", async () => {
  const controller = new AbortController();
  pages.mockImplementationOnce(async () => {
    controller.abort();
    return { images: ["a1"] };
  });
  const retry = runner.createImageRetry(task, controller.signal);
  await expect(retry("a1")).rejects.toMatchObject({ name: "AbortError" });
  await expect(retry("a2")).rejects.toMatchObject({ name: "AbortError" });
  expect(loadBytes).not.toHaveBeenCalled();
  expect(repository.items(task.id).every((item) => item.status === "failed")).toBe(true);
});
