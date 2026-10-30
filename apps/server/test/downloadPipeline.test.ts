import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStorage, type DownloadTask } from "@mansou/storage";
import type { SourceRegistry, SourceProvider } from "@mansou/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";
import { DownloadRunner } from "../src/services/downloads/downloadRunner.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: DownloadRepository;
let runner: DownloadRunner;
const task: DownloadTask = {
  id: "task",
  sourceKey: "source",
  comicId: "comic",
  episodeId: "__all__",
  all: true,
  status: "running",
  phase: "queued",
  total: 0,
  completed: 0,
  logs: [],
  createdAt: "now",
  updatedAt: "now",
};
let state: Partial<DownloadTask>;
const pages = vi.fn<SourceProvider["comicPages"]>();
const loadBytes = vi.fn(async (input: { imageKey: string }) => ({
  data: Buffer.from(input.imageKey),
  contentType: "image/jpeg",
  cached: false,
}));
let second: ReturnType<typeof deferred<{ images: string[] }>>;
let images: ReturnType<typeof deferred>;
let firstImage: ReturnType<typeof deferred>;
const running: Promise<unknown>[] = [];

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-pipeline-"));
  storage = createStorage(directory);
  repository = new DownloadRepository(storage);
  second = deferred();
  images = deferred();
  firstImage = deferred();
  state = {};
  pages.mockImplementation(async (_comicId, episodeId) =>
    episodeId === "b" ? second.promise : { images: [`${episodeId}-1`, `${episodeId}-2`] },
  );
  loadBytes.mockImplementation(async (input) => {
    firstImage.resolve();
    await images.promise;
    return { data: Buffer.from(input.imageKey), contentType: "image/jpeg", cached: false };
  });
  const provider = {
    comicDetails: async () => ({ title: "Comic", chapters: { a: "A", b: "B", c: "C" } }),
    comicPages: pages,
  };
  runner = new DownloadRunner(
    { get: () => provider } as unknown as SourceRegistry,
    { loadBytes },
    repository,
    { outputDir: directory, concurrency: 2, retries: 1 },
  );
});
afterEach(async () => {
  images.resolve();
  second.resolve({ images: ["b-1", "b-2"] });
  await Promise.allSettled(running.splice(0));
  storage.close();
  await rm(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});
function run(signal = new AbortController().signal) {
  const pending = runner.run(task, signal, (patch) => {
    state = { ...state, ...patch };
  });
  running.push(pending);
  return pending;
}

it("starts images after the first chapter, prefetches only one chapter and finalizes the discovered total", async () => {
  const pending = run();
  await firstImage.promise;
  expect(pages.mock.calls.map(([, id]) => id)).toEqual(["a", "b"]);
  expect(loadBytes).toHaveBeenCalledTimes(2);
  expect(state).toMatchObject({ total: 2, totalKnown: false });
  images.resolve();
  await vi.waitFor(() => expect(repository.items(task.id)).toHaveLength(2));
  expect(pages).toHaveBeenCalledTimes(2);
  second.resolve({ images: ["b-1", "b-2"] });
  await pending;
  expect(state).toMatchObject({
    total: 6,
    completed: 6,
    totalKnown: true,
    phase: "writing_metadata",
  });
  expect(
    (await readFile(path.join(directory, "source", "Comic_comic", "A", "0001.jpg"))).toString(),
  ).toBe("a-1");
});

it("retains earlier files after a prefetch failure and reuses them when resumed", async () => {
  const pending = run();
  const rejected = expect(pending).rejects.toThrow("chapter unavailable");
  await firstImage.promise;
  second.reject(new Error("chapter unavailable"));
  images.resolve();
  await rejected;
  expect(repository.items(task.id)).toHaveLength(2);
  expect(state).toMatchObject({ completed: 2, totalKnown: false });
  second = deferred();
  second.resolve({ images: ["b-1", "b-2"] });
  loadBytes.mockClear();
  await run();
  expect(loadBytes).toHaveBeenCalledTimes(4);
  expect(loadBytes.mock.calls.some(([input]) => input.imageKey.startsWith("a-"))).toBe(false);
  expect(state).toMatchObject({ total: 6, completed: 6, totalKnown: true });
});

it("waits for an in-flight prefetch before returning an image failure", async () => {
  loadBytes.mockRejectedValue(new Error("image unavailable"));
  const pending = run();
  const settled = vi.fn();
  void pending.then(settled, settled);
  const rejected = expect(pending).rejects.toThrow("image unavailable");
  await vi.waitFor(() => expect(loadBytes).toHaveBeenCalled());
  expect(settled).not.toHaveBeenCalled();
  second.resolve({ images: ["b-1"] });
  await rejected;
  expect(pages.mock.calls.map(([, id]) => id)).toEqual(["a", "b"]);
});

it("waits for pending IO on cancellation without writing files or starting later chapters", async () => {
  const controller = new AbortController();
  const pending = run(controller.signal);
  const settled = vi.fn();
  void pending.then(settled, settled);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await firstImage.promise;
  controller.abort();
  images.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  second.resolve({ images: ["b-1"] });
  await rejected;
  expect(repository.items(task.id)).toEqual([]);
  expect(pages).toHaveBeenCalledTimes(2);
});

it("can disable prefetch while still downloading the first chapter before discovering the rest", async () => {
  const provider = {
    comicDetails: async () => ({ title: "Comic", chapters: { a: "A", b: "B" } }),
    comicPages: pages,
  };
  runner = new DownloadRunner(
    { get: () => provider } as unknown as SourceRegistry,
    { loadBytes },
    repository,
    { outputDir: directory, concurrency: 1, retries: 1, prefetchChapter: false },
  );
  const pending = run();
  await firstImage.promise;
  expect(pages).toHaveBeenCalledOnce();
  images.resolve();
  second.resolve({ images: [] });
  await pending;
  expect(state).toMatchObject({ total: 2, completed: 2, totalKnown: true });
});
