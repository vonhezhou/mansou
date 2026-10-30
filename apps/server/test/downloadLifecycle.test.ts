import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, initializeApp } from "../src/app.js";
import { createStorage } from "@venera/storage";
import { readConfig } from "../src/config/config.js";
const config = readConfig();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let built: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
const releases: Array<() => void> = [];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "venera-download-lifecycle-"));
  config.dataDir = dir;
  config.downloadConcurrency = 1;
  config.downloadTaskConcurrency = 1;
  built = await buildApp(undefined, config);
  await initializeApp(built.context);
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await built.app.close();
  await rm(dir, { recursive: true, force: true });
});
function blockImage(skip = 0) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  releases.push(release.resolve);
  const original = built.context.imageProxy.loadBytes.bind(built.context.imageProxy);
  const spy = vi.spyOn(built.context.imageProxy, "loadBytes");
  for (let index = 0; index < skip; index++) spy.mockImplementationOnce(original);
  spy.mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    try {
      return await original(...args);
    } finally {
      finished.resolve();
    }
  });
  return { entered, release, finished, spy };
}
function create(comicId: string) {
  return built.context.downloads.create({ sourceKey: "mock", comicId, episodeId: "chapter-1" });
}

describe("download lifecycle", () => {
  it("keeps pause persisted after the in-flight image settles", async () => {
    const barrier = blockImage();
    const task = create("pause");
    await barrier.entered.promise;
    built.context.downloads.pause(task.id);
    barrier.release.resolve();
    await barrier.finished.promise;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(built.context.downloads.find(task.id)?.status).toBe("paused");
    expect(built.context.storage.listDownloads().find((item) => item.id === task.id)?.status).toBe(
      "paused",
    );
  });

  it("does not resurrect a deleted running task or its image records", async () => {
    const barrier = blockImage();
    const task = create("delete");
    await barrier.entered.promise;
    const deleting = built.context.downloads.delete(task.id, true);
    barrier.release.resolve();
    await deleting;
    await barrier.finished.promise;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(built.context.downloads.find(task.id)).toBeNull();
    expect(built.context.storage.listDownloadItems(task.id)).toEqual([]);
  });

  it("resumes only after the previous run ends and eventually completes", async () => {
    const barrier = blockImage();
    const task = create("resume");
    await barrier.entered.promise;
    built.context.downloads.pause(task.id);
    built.context.downloads.resume(task.id);
    expect(built.context.downloads.find(task.id)?.status).toBe("queued");
    barrier.release.resolve();
    await vi.waitFor(() =>
      expect(built.context.downloads.find(task.id)).toMatchObject({
        status: "completed",
        completed: 5,
        total: 5,
      }),
    );
  });
  it("waits for active IO before closing storage, then recovers on restart", async () => {
    const barrier = blockImage(1);
    const task = create("shutdown");
    await barrier.entered.promise;
    const closed = vi.spyOn(built.context.storage, "close");
    const closing = built.app.close();
    await vi.waitFor(() => expect(built.context.downloads.find(task.id)?.status).toBe("queued"));
    expect(closed).not.toHaveBeenCalled();
    barrier.release.resolve();
    await closing;
    expect(closed).toHaveBeenCalledOnce();
    const persisted = createStorage(dir);
    expect(persisted.getDownload(task.id)).toMatchObject({ status: "queued", completed: 1 });
    persisted.close();
    built = await buildApp(undefined, config);
    const restoredImages = vi.spyOn(built.context.imageProxy, "loadBytes");
    await initializeApp(built.context);
    await vi.waitFor(() =>
      expect(built.context.downloads.find(task.id)).toMatchObject({
        status: "completed",
        completed: 5,
        recovered: true,
      }),
    );
    expect(restoredImages).toHaveBeenCalledTimes(4);
    expect(restoredImages.mock.calls.some(([input]) => input.imageKey.endsWith("/1"))).toBe(false);
  });

  it("publishes persisted snapshots without later mutation", async () => {
    const barrier = blockImage();
    const events: unknown[] = [];
    const mismatches: unknown[] = [];
    const unsubscribe = built.context.downloads.subscribe((tasks) => {
      if (JSON.stringify(tasks) !== JSON.stringify(built.context.storage.listDownloads()))
        mismatches.push(tasks);
      events.push(tasks);
    });
    const task = create("events");
    await barrier.entered.promise;
    const snapshot = JSON.stringify(events);
    built.context.downloads.pause(task.id);
    barrier.release.resolve();
    await built.context.downloads.close();
    expect(JSON.stringify(events.slice(0, JSON.parse(snapshot).length))).toBe(snapshot);
    expect(mismatches).toEqual([]);
    expect(built.context.downloads.find(task.id)?.status).toBe("paused");
    unsubscribe();
  });

  it("redownloads a missing completed file on resume while retaining other completed images", async () => {
    const barrier = blockImage(2);
    const task = create("missing-on-resume");
    await barrier.entered.promise;
    built.context.downloads.pause(task.id);
    const records = built.context.storage.listDownloadItems(task.id);
    expect(records).toHaveLength(2);
    const [missing, retained] = records;
    await rm(missing.file_path!);
    barrier.release.resolve();
    await barrier.finished.promise;
    barrier.spy.mockClear();
    built.context.downloads.resume(task.id);
    await vi.waitFor(() =>
      expect(built.context.downloads.find(task.id)).toMatchObject({
        status: "completed",
        completed: 5,
        total: 5,
      }),
    );
    expect(barrier.spy).toHaveBeenCalledTimes(4);
    expect(barrier.spy.mock.calls.some(([input]) => input.imageKey === missing.image_key)).toBe(
      true,
    );
    expect(barrier.spy.mock.calls.some(([input]) => input.imageKey === retained.image_key)).toBe(
      false,
    );
    await expect(access(missing.file_path!)).resolves.toBeUndefined();
  });

  it("holds its concurrency slot until cancelled IO finishes", async () => {
    const barrier = blockImage();
    const first = create("cancel");
    await barrier.entered.promise;
    built.context.downloads.cancel(first.id);
    const second = create("next");
    expect(built.context.downloads.find(second.id)?.status).toBe("queued");
    expect(barrier.spy).toHaveBeenCalledTimes(1);
    barrier.release.resolve();
    await vi.waitFor(() =>
      expect(built.context.downloads.find(second.id)?.status).toBe("completed"),
    );
    expect(built.context.downloads.find(first.id)?.status).toBe("cancelled");
    expect(built.context.storage.listDownloadItems(first.id)).toEqual([]);
  });

  it("reruns a cancelled task with a new id", async () => {
    const barrier = blockImage();
    const task = create("rerun");
    await barrier.entered.promise;
    built.context.downloads.cancel(task.id);
    const rerun = built.context.downloads.rerun(task.id)!;
    expect(rerun.id).not.toBe(task.id);
    barrier.release.resolve();
    await vi.waitFor(() =>
      expect(built.context.downloads.find(rerun.id)?.status).toBe("completed"),
    );
    expect(built.context.downloads.find(task.id)?.status).toBe("cancelled");
  });
  it("rejects per-image retries while a task is running", async () => {
    const barrier = blockImage();
    const task = create("retry-conflict");
    await barrier.entered.promise;
    const response = await built.app.inject({
      method: "POST",
      url: `/api/v1/downloads/${task.id}/items/retry`,
      payload: { imageKey: "image" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DOWNLOAD_BUSY");
    barrier.release.resolve();
  });

  it.each([false, true])("honors files=%s when deleting over HTTP", async (files) => {
    const task = create(`files-${files}`);
    await vi.waitFor(() => expect(built.context.downloads.find(task.id)?.status).toBe("completed"));
    const directory = built.context.downloads.find(task.id)!.outputDir!;
    const response = await built.app.inject({
      method: "DELETE",
      url: `/api/v1/downloads/${task.id}?files=${files}`,
    });
    expect(response.statusCode).toBe(200);
    if (files) await expect(access(directory)).rejects.toThrow();
    else await expect(access(directory)).resolves.toBeUndefined();
    expect(built.context.downloads.find(task.id)).toBeNull();
  });
});
