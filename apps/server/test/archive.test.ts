import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStorage, type DownloadTask } from "@venera/storage";
import * as archive from "../src/services/downloads/archive.js";
import { DownloadService } from "../src/services/downloads/downloadService.js";
import { DownloadRepository } from "../src/services/downloads/downloadRepository.js";
import type { DownloadRunner } from "../src/services/downloads/downloadRunner.js";

let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: DownloadRepository;
let service: DownloadService;
let images: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "venera-archive-"));
  images = path.join(directory, "images");
  await mkdir(path.join(images, "chapter"), { recursive: true });
  storage = createStorage(directory);
  repository = new DownloadRepository(storage);
  // 本组只导出已完成任务，不启动下载执行器。
  service = new DownloadService(repository, {} as DownloadRunner, 1, vi.fn());
});
afterEach(async () => {
  await service.close();
  storage.close();
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function saveTask(id: string, outputDir = images, version = "2026-10-29T00:00:00.000Z") {
  const task: DownloadTask = {
    id,
    sourceKey: "mock",
    comicId: id,
    status: "completed",
    phase: "completed",
    total: 1,
    completed: 1,
    createdAt: version,
    updatedAt: version,
    logs: [],
    outputDir,
  };
  repository.save(task);
  return task;
}
function zipEntries(data: Buffer) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = data.readUInt32LE(end + 16);
  return Array.from({ length: data.readUInt16LE(end + 10) }, () => {
    const method = data.readUInt16LE(offset + 10),
      size = data.readUInt32LE(offset + 20);
    const length = data.readUInt16LE(offset + 28),
      extra = data.readUInt16LE(offset + 30),
      comment = data.readUInt16LE(offset + 32);
    const name = data.subarray(offset + 46, offset + 46 + length).toString();
    const local = data.readUInt32LE(offset + 42);
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const bytes = data.subarray(start, start + size);
    offset += 46 + length + extra + comment;
    return { name, method, data: method === 8 ? inflateRawSync(bytes) : bytes };
  });
}

it("stores compressed image bytes without recompressing and preserves nested archive contents", async () => {
  await writeFile(
    path.join(images, "chapter", "0001.jpg"),
    Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]),
  );
  await writeFile(path.join(images, "notes.txt"), "notes ".repeat(100));
  await writeFile(path.join(images, "metadata.json"), "private metadata");
  await writeFile(path.join(images, "old.cbz"), "old archive");
  await writeFile(
    path.join(images, "chapter.cbz.00000000-0000-0000-0000-000000000000.tmp"),
    "partial archive",
  );
  const output = path.join(directory, "book.cbz");
  await archive.zipDirectory(images, output);
  const entries = zipEntries(await readFile(output));
  expect(entries.map((entry) => entry.name)).toEqual(["chapter/0001.jpg", "notes.txt"]);
  expect(entries[0].method).toBe(0);
  expect(entries[0].data).toEqual(Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]));
  expect(entries[1].method).toBe(8);
  expect(entries[1].data.toString()).toBe("notes ".repeat(100));
});

it("preserves filename ordering and follows file and directory symlinks", async () => {
  await writeFile(path.join(images, "chapter", "0001.jpg"), "nested image");
  await writeFile(path.join(images, "z.jpg"), "last image");
  await writeFile(path.join(images, "Upper.jpg"), "uppercase image");
  await symlink("chapter/0001.jpg", path.join(images, "a.jpg"));
  await symlink("chapter", path.join(images, "b"));
  const output = path.join(directory, "links.cbz");
  await archive.zipDirectory(images, output);
  const entries = zipEntries(await readFile(output));
  expect(entries.map((entry) => entry.name)).toEqual([
    "Upper.jpg",
    "a.jpg",
    "b/0001.jpg",
    "chapter/0001.jpg",
    "z.jpg",
  ]);
  expect(entries.map((entry) => entry.data.toString())).toEqual([
    "uppercase image",
    "nested image",
    "nested image",
    "nested image",
    "last image",
  ]);
});

it("rejects broken symlinks before opening an output file", async () => {
  await symlink("missing.jpg", path.join(images, "broken.jpg"));
  const output = path.join(directory, "broken.cbz");
  await expect(archive.zipDirectory(images, output)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("reuses a prepared archive but rebuilds after removal, task updates or related chapter updates", async () => {
  await writeFile(path.join(images, "chapter", "0001.jpg"), "first image");
  const task = saveTask("all");
  const zip = vi.spyOn(archive, "zipDirectory");
  const first = (await service.exportCbz(task.id))!;
  const opened = (await service.openCbz(task.id))!;
  const chunks: Buffer[] = [];
  for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk));
  expect(zip).toHaveBeenCalledTimes(1);
  expect(zipEntries(Buffer.concat(chunks))[0].data.toString()).toBe("first image");
  await rm(first.path);
  await service.exportCbz(task.id);
  expect(zip).toHaveBeenCalledTimes(2);
  saveTask("all", images, "2026-10-29T00:00:01.000Z");
  await service.exportCbz(task.id);
  expect(zip).toHaveBeenCalledTimes(3);
  saveTask("chapter", path.join(images, "chapter"));
  await service.exportCbz(task.id);
  expect(zip).toHaveBeenCalledTimes(4);
  await writeFile(path.join(images, "chapter", "0001.jpg"), "updated image");
  saveTask("chapter", path.join(images, "chapter"), "2026-10-29T00:00:02.000Z");
  await service.exportCbz(task.id);
  expect(zip).toHaveBeenCalledTimes(5);
  expect(zipEntries(await readFile(first.path))[0].data.toString()).toBe("updated image");
});

it("does not cache a failed archive or leave a temporary output behind", async () => {
  saveTask("all");
  const zip = vi.spyOn(archive, "zipDirectory").mockRejectedValueOnce(new Error("disk failure"));
  await expect(service.exportCbz("all")).rejects.toThrow("disk failure");
  expect((await readdir(directory)).some((file) => file.endsWith(".tmp"))).toBe(false);
  await service.exportCbz("all");
  expect(zip).toHaveBeenCalledTimes(2);
});

it("invalidates a prepared archive even when a retry updates the task within the same timestamp", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T00:00:00.000Z"));
  try {
    const image = path.join(images, "chapter", "0001.jpg");
    await writeFile(image, "old image");
    const task = saveTask("all");
    await service.close();
    const runner = {
      retryImage: async () => {
        await writeFile(image, "retried image");
        return {
          downloaded: true,
          item: {
            id: "item",
            task_id: task.id,
            image_key: "page",
            file_path: image,
            status: "completed",
            retry_count: 1,
            error: null,
            error_code: null,
            updated_at: task.updatedAt,
          },
        };
      },
    } as unknown as DownloadRunner;
    service = new DownloadService(repository, runner, 1, vi.fn());
    const zip = vi.spyOn(archive, "zipDirectory");
    const prepared = (await service.exportCbz(task.id))!;
    await service.retryImage(task.id, "page");
    expect(service.find(task.id)?.updatedAt).toBe(task.updatedAt);
    await service.exportCbz(task.id);
    expect(zip).toHaveBeenCalledTimes(2);
    expect(zipEntries(await readFile(prepared.path))[0].data.toString()).toBe("retried image");
  } finally {
    vi.useRealTimers();
  }
});
