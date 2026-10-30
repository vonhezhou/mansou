import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStorage } from "@venera/storage";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";

let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: DownloadRepository;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "venera-download-records-"));
  storage = createStorage(directory);
  repository = new DownloadRepository(storage);
});
afterEach(async () => {
  storage.close();
  await rm(directory, { recursive: true, force: true });
});
it("only reuses a completed image record with a file that still exists", async () => {
  const filePath = path.join(directory, "page.jpg");
  await writeFile(filePath, "image");
  for (const status of ["failed", "completed"]) {
    repository.saveItem({ taskId: "task", imageKey: "image", status, filePath });
    expect(await repository.completedFile("task", "image")).toBe(
      status === "completed" ? filePath : null,
    );
  }
  expect(await repository.completedFile("other-task", "image")).toBeNull();
  await rm(filePath);
  expect(await repository.completedFile("task", "image")).toBeNull();
});
it("propagates a filesystem error instead of treating it as a missing image", async () => {
  const file = path.join(directory, "not-a-directory");
  await writeFile(file, "image");
  repository.saveItem({
    taskId: "task",
    imageKey: "image",
    status: "completed",
    filePath: path.join(file, "image.jpg"),
  });
  await expect(repository.completedFile("task", "image")).rejects.toMatchObject({
    code: "ENOTDIR",
  });
});
