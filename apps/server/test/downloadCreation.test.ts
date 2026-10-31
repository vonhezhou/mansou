import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStorage, type DownloadTask } from "@mansou/storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";
import { DownloadService } from "../src/services/downloads/downloadService.js";
import type { DownloadRunner } from "../src/services/downloads/downloadRunner.js";

let directory: string;
let storage: ReturnType<typeof createStorage>;
let service: DownloadService;
const input = { sourceKey: "source", comicId: "comic", episodeId: "chapter" };
const task = (id: string, patch: Partial<DownloadTask> = {}): DownloadTask => ({
  ...input,
  id,
  status: "queued",
  phase: "queued",
  total: 0,
  completed: 0,
  logs: [],
  createdAt: "2026-10-30T00:00:00Z",
  updatedAt: "2026-10-30T00:00:00Z",
  ...patch,
});
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-download-creation-"));
  storage = createStorage(directory);
  // 不初始化调度，单独验证创建命令的持久化与去重规则。
  service = new DownloadService(new DownloadRepository(storage), {} as DownloadRunner, 1, vi.fn());
});
afterEach(async () => {
  await service.close();
  storage.close();
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it.each(["queued", "running", "paused", "completed"] as const)(
  "reuses an equivalent %s task without parsing unrelated history",
  (status) => {
    storage.saveDownload(task("other-source", { sourceKey: "other" }));
    storage.saveDownload(task("other-comic", { comicId: "other" }));
    storage.saveDownload(task("existing", { status }));
    const list = vi.spyOn(storage, "listDownloads");
    const candidates = vi.spyOn(storage, "listComicDownloads");
    expect(service.create(input).id).toBe("existing");
    expect(list).not.toHaveBeenCalled();
    expect(candidates).toHaveBeenCalledOnce();
    expect(candidates).toHaveBeenCalledWith("source", "comic");
  },
);

it.each(["failed", "cancelled"] as const)(
  "creates a fresh task after an equivalent %s task",
  (status) => {
    storage.saveDownload(task("old", { status }));
    const created = service.create(input);
    expect(created.id).not.toBe("old");
    expect(storage.getDownload(created.id)).toMatchObject({ ...input, status: "queued" });
  },
);

it("keeps chapter and full-comic requests distinct and reads the latest persisted state", () => {
  storage.saveDownload(task("all", { all: true, episodeId: "__all__" }));
  expect(service.create({ ...input, all: true }).id).toBe("all");
  const chapter = service.create(input);
  expect(chapter.id).not.toBe("all");
  service.pause(chapter.id);
  expect(service.create(input)).toMatchObject({ id: chapter.id, status: "paused" });
  service.cancel(chapter.id);
  expect(service.create(input).id).not.toBe(chapter.id);
  expect(service.create({ ...input, episodeId: "other-chapter" }).episodeId).toBe("other-chapter");
});

it("preserves candidate creation order and returns independent snapshots", () => {
  storage.saveDownload(task("later", { createdAt: "2026-10-30T01:00:00Z" }));
  storage.saveDownload(task("earlier"));
  const candidates = storage.listComicDownloads("source", "comic");
  expect(candidates.map((item) => item.id)).toEqual(["earlier", "later"]);
  candidates[0].status = "failed";
  expect(service.create(input)).toMatchObject({ id: "earlier", status: "queued" });
});

it("keeps download tasks separate for the same comic and original key in different subscriptions", () => {
  const first = service.create({ ...input, sourceKey: "a:shared" });
  const second = service.create({ ...input, sourceKey: "b:shared" });
  expect(first.id).not.toBe(second.id);
  expect(service.create({ ...input, sourceKey: "a:shared" }).id).toBe(first.id);
  expect(storage.getDownload(second.id)?.sourceKey).toBe("b:shared");
});
