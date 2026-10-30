import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStorage } from "@venera/storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";
import { DownloadService } from "../src/services/downloads/downloadService.js";
import type { DownloadRunner, DownloadProgress } from "../src/services/downloads/downloadRunner.js";

let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: DownloadRepository;
let service: DownloadService;
let progress: DownloadProgress;
let release: () => void;
let taskId: string;
const listener = vi.fn();
const onError = vi.fn();
let unsubscribe: () => void;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  directory = await mkdtemp(path.join(os.tmpdir(), "venera-download-events-"));
  storage = createStorage(directory);
  repository = new DownloadRepository(storage);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = {
    run: async (_task, _signal, publish) => {
      progress = publish;
      entered();
      await pending;
    },
  } satisfies Pick<DownloadRunner, "run">;
  service = new DownloadService(repository, runner as DownloadRunner, 1, onError);
  unsubscribe = service.subscribe(listener);
  expect(listener.mock.calls[0][0]).toEqual([]);
  await service.init();
  taskId = service.create({ sourceKey: "mock", comicId: "comic" }).id;
  await started;
  listener.mockClear();
});
afterEach(async () => {
  release();
  await service.close();
  storage.close();
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("persists every progress update but reads and broadcasts only the latest snapshot per window", () => {
  const all = vi.spyOn(repository, "all");
  for (let completed = 1; completed <= 100; completed++) progress({ completed, total: 100 });
  expect(service.find(taskId)?.completed).toBe(100);
  expect(all).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(99);
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(all).toHaveBeenCalledOnce();
  expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.calls[0][0]).toEqual(storage.listDownloads());
  progress({ completed: 101 });
  vi.advanceTimersByTime(100);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener.mock.calls[0][0][0].completed).toBe(100);
});

it.each(["pause", "cancel"] as const)(
  "publishes %s immediately and cancels the stale progress broadcast",
  (action) => {
    progress({ completed: 3 });
    service[action](taskId);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0][0]).toMatchObject({
      completed: 3,
      status: action === "pause" ? "paused" : "cancelled",
    });
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledOnce();
  },
);

it("publishes completion immediately with the final progress", async () => {
  progress({ completed: 100, total: 100 });
  let completed!: () => void;
  const done = new Promise<void>((resolve) => {
    completed = resolve;
  });
  const stop = service.subscribe((tasks) => {
    if (tasks[0]?.status === "completed") completed();
  });
  release();
  await done;
  expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.calls[0][0][0]).toMatchObject({ completed: 100, status: "completed" });
  vi.advanceTimersByTime(1000);
  expect(listener).toHaveBeenCalledOnce();
  stop();
});

it("clears pending work when the last subscriber leaves", () => {
  const all = vi.spyOn(repository, "all");
  progress({ completed: 1 });
  unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(1000);
  expect(all).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});

it("does not read storage or notify subscribers after shutdown", async () => {
  progress({ completed: 1 });
  release();
  await service.close();
  const all = vi.spyOn(repository, "all");
  listener.mockClear();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(1000);
  expect(all).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});

it("reports a failed deferred snapshot and still delivers later progress", () => {
  vi.spyOn(repository, "all").mockImplementationOnce(() => {
    throw new Error("read failed");
  });
  progress({ completed: 1 });
  vi.advanceTimersByTime(100);
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "read failed" }));
  expect(listener).not.toHaveBeenCalled();
  progress({ completed: 2 });
  vi.advanceTimersByTime(100);
  expect(listener.mock.calls[0][0][0].completed).toBe(2);
});
