import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { installMockSource } from "./helpers/mockSource.js";
import { buildApp, initializeApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";

let built: Awaited<ReturnType<typeof buildApp>> | undefined;
let directory: string;
afterEach(async () => {
  await built?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("持久化默认目录，按任务固定目录并按目录去重，重启后仍可恢复", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-directory-"));
  const config = { ...readConfig(), dataDir: directory };
  built = await buildApp(undefined, config);
  const firstDir = path.join(directory, "first");
  const secondDir = path.join(directory, "second");
  const save = await built.app.inject({
    method: "PUT",
    url: "/api/v1/settings/downloads",
    payload: { downloadDir: firstDir },
  });
  expect(save.statusCode).toBe(200);
  const input = { sourceKey: "source", comicId: "book" };
  const first = built.context.downloads.create(input);
  expect(first.downloadDir).toBe(firstDir);
  expect(built.context.downloads.create(input).id).toBe(first.id);
  built.context.downloadDirectory.save(secondDir);
  const second = built.context.downloads.create(input);
  expect(second.id).not.toBe(first.id);
  expect(second.downloadDir).toBe(secondDir);
  expect(built.context.downloads.create({ ...input, downloadDir: firstDir }).id).toBe(first.id);
  await built.app.close();
  built = await buildApp(undefined, config);
  const settings = await built.app.inject({ method: "GET", url: "/api/v1/settings/downloads" });
  expect(settings.json()).toEqual({ downloadDir: secondDir });
  expect(built.context.downloads.find(first.id)?.downloadDir).toBe(firstDir);
});

it("拒绝相对路径及无法写入的目录，保留原设置且不创建任务", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-directory-"));
  built = await buildApp(undefined, { ...readConfig(), dataDir: directory });
  const original = built.context.downloadDirectory.settings();
  const file = path.join(directory, "file");
  await writeFile(file, "occupied");
  for (const downloadDir of ["relative/path", path.join(file, "nested")]) {
    const response = await built.app.inject({
      method: "PUT",
      url: "/api/v1/settings/downloads",
      payload: { downloadDir },
    });
    expect(response.statusCode).toBe(400);
    const download = await built.app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      payload: { sourceKey: "source", comicId: "book", downloadDir },
    });
    expect(download.statusCode).toBe(400);
  }
  expect(built.context.downloadDirectory.settings()).toEqual(original);
  expect(built.context.downloads.all()).toEqual([]);
});

it("漫画任务写入创建时指定的目录，修改默认值后仍可导出", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-directory-"));
  built = await buildApp(undefined, { ...readConfig(), dataDir: directory });
  await installMockSource(built.context);
  await initializeApp(built.context);
  const downloadDir = path.join(directory, "custom");
  const task = built.context.downloads.create({
    sourceKey: "mock",
    comicId: "custom",
    episodeId: "chapter-1",
    downloadDir,
  });
  built.context.downloadDirectory.save(path.join(directory, "new-default"));
  await vi.waitFor(() => expect(built!.context.downloads.find(task.id)?.status).toBe("completed"));
  const completed = built.context.downloads.find(task.id)!;
  expect(completed.outputDir?.startsWith(downloadDir + path.sep)).toBe(true);
  const exported = await built.context.downloads.openCbz(task.id);
  expect(exported?.path.startsWith(downloadDir + path.sep)).toBe(true);
  exported?.stream.destroy();
});
