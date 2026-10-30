import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStorage } from "@venera/storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  access: vi.fn(),
}));

let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: DownloadRepository;
const releases: Array<() => void> = [];
beforeEach(async () => {
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(fs.access).mockReset().mockImplementation(original.access);
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "venera-download-records-"));
  storage = createStorage(directory);
  repository = new DownloadRepository(storage);
});
afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  vi.restoreAllMocks();
  storage.close();
  await fs.rm(directory, { recursive: true, force: true });
});
const signal = () => new AbortController().signal;

it("counts only planned completed images with existing files and preserves duplicate-page counts", async () => {
  const filePath = path.join(directory, "page.jpg");
  await fs.writeFile(filePath, "image");
  for (const [imageKey, status, file] of [
    ["valid", "completed", filePath],
    ["failed", "failed", filePath],
    ["missing", "completed", `${filePath}.missing`],
    ["unplanned", "completed", filePath],
  ])
    repository.saveItem({ taskId: "task", imageKey, status, filePath: file });
  repository.saveItem({ taskId: "other", imageKey: "foreign", status: "completed", filePath });
  repository.saveItem({ taskId: "task", imageKey: "no-path", status: "completed" });
  const keys = ["valid", "valid", "failed", "missing", "unknown", "no-path", "foreign"];
  expect(await repository.countCompletedFiles("task", keys, 4, signal())).toBe(2);
  await fs.rm(filePath);
  expect(await repository.countCompletedFiles("task", keys, 4, signal())).toBe(0);
});

it("uses one record-list query and no per-image lookup or filesystem access for a fresh task", async () => {
  const list = vi.spyOn(storage, "listDownloadItems");
  const item = vi.spyOn(storage, "getDownloadItem");
  const access = vi.mocked(fs.access);
  expect(
    await repository.countCompletedFiles(
      "task",
      Array.from({ length: 10000 }, (_, index) => String(index)),
      4,
      signal(),
    ),
  ).toBe(0);
  expect(list).toHaveBeenCalledOnce();
  expect(item).not.toHaveBeenCalled();
  expect(access).not.toHaveBeenCalled();
});

it("bounds file checks by concurrency and waits for in-flight checks when cancelled", async () => {
  for (let index = 0; index < 10; index++)
    repository.saveItem({
      taskId: "task",
      imageKey: String(index),
      status: "completed",
      filePath: `/page-${index}`,
    });
  const access = vi.mocked(fs.access).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      }),
  );
  const controller = new AbortController();
  const pending = repository.countCompletedFiles(
    "task",
    Array.from({ length: 10 }, (_, index) => String(index)),
    3,
    controller.signal,
  );
  const settled = vi.fn();
  void pending.then(settled, settled);
  expect(access).toHaveBeenCalledTimes(3);
  controller.abort();
  releases.shift()!();
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  releases.splice(0).forEach((release) => release());
  await rejected;
  expect(access).toHaveBeenCalledTimes(3);
});

it("propagates unexpected filesystem errors after other in-flight checks finish", async () => {
  for (const imageKey of ["bad", "good"])
    repository.saveItem({
      taskId: "task",
      imageKey,
      status: "completed",
      filePath: `/page-${imageKey}`,
    });
  const error = Object.assign(new Error("access denied"), { code: "EACCES" });
  vi.mocked(fs.access)
    .mockRejectedValueOnce(error)
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
  const pending = repository.countCompletedFiles("task", ["bad", "good"], 2, signal());
  const settled = vi.fn();
  void pending.then(settled, settled);
  const rejected = expect(pending).rejects.toBe(error);
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  releases.splice(0).forEach((release) => release());
  await rejected;
});
