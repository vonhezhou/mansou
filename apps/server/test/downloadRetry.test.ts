import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SourceProvider, SourceRegistry } from "@mansou/core";
import { createStorage, type DownloadTask } from "@mansou/storage";
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
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-retry-"));
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
  expect(result!.results[0]).toMatchObject({
    imageKey: "a1",
    item: { image_key: "a1", status: "completed" },
  });
  for (const item of result!.results) {
    expect(item).not.toHaveProperty("task");
    expect(item).not.toHaveProperty("result");
  }
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
    expect(result!.results[0]).toEqual({
      imageKey: "a1",
      ok: false,
      error: "temporary upstream error",
    });
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

it("locates retries in reverse chapter order without loading unneeded chapters", async () => {
  const retry = runner.createImageRetry(task, new AbortController().signal);
  await retry("a2");
  expect(pages.mock.calls).toEqual([["comic", "a"]]);
  for (const imageKey of ["b2", "a1", "b1"]) await retry(imageKey);
  expect(details).toHaveBeenCalledOnce();
  expect(pages.mock.calls).toEqual([
    ["comic", "a"],
    ["comic", "b"],
  ]);
  expect(loadBytes.mock.calls.map(([input]) => [input.imageKey, input.episodeId])).toEqual([
    ["a2", "a"],
    ["b2", "b"],
    ["a1", "a"],
    ["b1", "b"],
  ]);
});

it("keeps the first position for duplicate keys within and across parsed chapters", async () => {
  pages.mockImplementation(async (_comicId, episodeId) => ({
    images: episodeId === "a" ? ["shared", "a1", "shared"] : ["b1", "shared"],
  }));
  const retry = runner.createImageRetry(task, new AbortController().signal);
  await retry("b1");
  await retry("shared");
  expect(repository.item(task.id, "shared")?.file_path).toBe(
    path.join(directory, "source", "Comic_comic", "First", "0001.jpg"),
  );
  expect(loadBytes.mock.lastCall![0]).toMatchObject({ imageKey: "shared", episodeId: "a" });
  expect((await readFile(repository.item(task.id, "shared")!.file_path!)).toString()).toBe(
    "shared",
  );
});

it("retries a failed later chapter after downloading a known earlier image", async () => {
  let failed = false;
  pages.mockImplementation(async (_comicId, episodeId) => {
    if (episodeId === "b" && !failed) {
      failed = true;
      throw new Error("temporary chapter error");
    }
    return { images: episodeId === "a" ? ["a1", "a2"] : ["b1", "b2"] };
  });
  const retry = runner.createImageRetry(task, new AbortController().signal);
  await expect(retry("b1")).rejects.toThrow("temporary chapter error");
  await retry("a2");
  await retry("b2");
  expect(pages.mock.calls).toEqual([
    ["comic", "a"],
    ["comic", "b"],
    ["comic", "b"],
  ]);
  expect(repository.item(task.id, "a2")?.status).toBe("completed");
  expect(repository.item(task.id, "b2")?.status).toBe("completed");
});

it("keeps parsed positions after an unknown key and does not reload exhausted chapters", async () => {
  const retry = runner.createImageRetry(task, new AbortController().signal);
  await expect(retry("missing")).rejects.toThrow("Image not found in task episodes: missing");
  await retry("a2");
  await expect(retry("also-missing")).rejects.toThrow(
    "Image not found in task episodes: also-missing",
  );
  expect(pages).toHaveBeenCalledTimes(2);
  expect(loadBytes).toHaveBeenCalledOnce();
});

it("queries only failed keys without loading complete image history", async () => {
  repository.saveItem({
    taskId: task.id,
    imageKey: "completed",
    status: "completed",
    filePath: "/missing",
  });
  repository.saveItem({
    taskId: task.id,
    imageKey: "error-only",
    status: "completed",
    error: "notice",
  });
  repository.saveItem({ taskId: "foreign", imageKey: "foreign", status: "failed" });
  const all = vi.spyOn(storage, "listDownloadItems");
  const failed = vi.spyOn(storage, "listFailedDownloadImageKeys");
  const result = await service.retryFailedImages(task.id);
  expect(result!.results.map((item) => item.imageKey)).toEqual(["a1", "a2", "b1", "b2"]);
  expect(all).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledOnce();
  expect(loadBytes).toHaveBeenCalledTimes(4);
});

it("returns an empty batch without loading source metadata when no failed records remain", async () => {
  storage.deleteDownloadItems(task.id);
  expect(await service.retryFailedImages(task.id)).toMatchObject({
    retried: 0,
    results: [],
    task: { id: task.id },
  });
  expect(details).not.toHaveBeenCalled();
  expect(pages).not.toHaveBeenCalled();
  expect(loadBytes).not.toHaveBeenCalled();
});

it("waits for the active image on shutdown and does not retry subsequent selected keys", async () => {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((done) => {
    entered = done;
  });
  const gate = new Promise<void>((done) => {
    release = done;
  });
  loadBytes.mockImplementationOnce(async () => {
    entered();
    await gate;
    return { data: Buffer.from("image"), contentType: "image/jpeg", cached: false };
  });
  const pending = service.retryFailedImages(task.id);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  try {
    await started;
    const closed = vi.fn();
    const closing = service.close().then(closed);
    await Promise.resolve();
    expect(closed).not.toHaveBeenCalled();
    release();
    await closing;
    await rejected;
    expect(loadBytes).toHaveBeenCalledOnce();
    expect(repository.items(task.id).every((item) => item.status === "failed")).toBe(true);
  } finally {
    release();
    await Promise.allSettled([pending]);
  }
});
