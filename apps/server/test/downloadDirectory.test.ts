import { mkdtemp, rm, writeFile, mkdir, symlink, realpath, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { NovelEngineExecutor } from "../src/services/novels/engineExecutor.js";
import { installMockSource } from "./helpers/mockSource.js";
import { buildApp, initializeApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";

let built: Awaited<ReturnType<typeof buildApp>> | undefined;
let directory: string;
afterEach(async () => {
  await built?.app.close();
  vi.restoreAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup() {
  directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "mansou-directory-")));
  built = await buildApp(undefined, { ...readConfig(), dataDir: directory });
  return {
    publicDir: path.join(directory, "public"),
    personalDir: path.join(directory, "personal"),
    defaultDestination: "public" as const,
  };
}

it("持久化双目的地，按目录区分同书任务，修改设置和重启后保持原路径与标签", async () => {
  const settings = await setup();
  const save = await built!.app.inject({
    method: "PUT",
    url: "/api/v1/settings/downloads",
    payload: settings,
  });
  expect(save.statusCode).toBe(200);
  const input = { sourceKey: "source", comicId: "book" };
  const create = async (destination?: string) => {
    const response = await built!.app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      payload: { ...input, destination },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  const first = await create();
  const second = await create("personal");
  expect(first.downloadDir).toBe(settings.publicDir);
  expect(first.destination).toBe("public");
  expect(second.downloadDir).toBe(settings.personalDir);
  expect(second.destination).toBe("personal");
  expect(second.id).not.toBe(first.id);
  expect((await create("personal")).id).toBe(second.id);
  expect((await create("public")).id).toBe(first.id);
  const next = {
    ...settings,
    personalDir: path.join(directory, "new-personal"),
    defaultDestination: "personal" as const,
  };
  built!.context.downloadDirectory.save(next);
  const third = await create();
  expect(third.downloadDir).toBe(next.personalDir);
  expect(third.destination).toBe("personal");
  await built!.app.close();
  built = await buildApp(undefined, { ...readConfig(), dataDir: directory });
  expect(built.context.downloadDirectory.settings()).toEqual(next);
  expect(built.context.downloads.find(second.id)).toMatchObject({
    downloadDir: settings.personalDir,
    destination: "personal",
  });
  await initializeApp(built.context);
  const resumed = built.context.downloads.resume(second.id);
  expect(resumed?.downloadDir).toBe(settings.personalDir);
  const rerun = built.context.downloads.rerun(second.id);
  expect(rerun?.downloadDir).toBe(settings.personalDir);
  expect(rerun?.destination).toBe("personal");
});

it("拒绝相同、嵌套、软链接重叠、相对和不可写目录，失败保留设置", async () => {
  const settings = await setup();
  built!.context.downloadDirectory.save(settings);
  const file = path.join(directory, "file");
  await writeFile(file, "occupied");
  const alias = path.join(directory, "alias");
  await symlink(settings.publicDir, alias);
  for (const personalDir of [
    settings.publicDir,
    path.join(settings.publicDir, "nested"),
    directory,
    alias,
    path.join(alias, "child"),
    "relative/path",
    path.join(file, "nested"),
  ]) {
    const response = await built!.app.inject({
      method: "PUT",
      url: "/api/v1/settings/downloads",
      payload: { ...settings, personalDir },
    });
    expect(response.statusCode).toBe(400);
    expect(built!.context.downloadDirectory.settings()).toEqual(settings);
  }
  for (const payload of [{ destination: "invalid" }, { downloadDir: settings.publicDir }]) {
    const response = await built!.app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      payload: { sourceKey: "source", comicId: "book", ...payload },
    });
    expect(response.statusCode).toBe(400);
  }
  // 目的地故障不得回落到另一个目录。
  await rm(settings.personalDir, { recursive: true });
  await writeFile(settings.personalDir, "occupied");
  const response = await built!.app.inject({
    method: "POST",
    url: "/api/v1/downloads",
    payload: { sourceKey: "source", comicId: "book", destination: "personal" },
  });
  expect(response.statusCode).toBe(400);
  expect(built!.context.downloads.all()).toEqual([]);
  const shared = await built!.app.inject({
    method: "POST",
    url: "/api/v1/downloads",
    payload: { sourceKey: "source", comicId: "book", destination: "public" },
  });
  expect(shared.statusCode).toBe(200);
  expect(shared.json().downloadDir).toBe(settings.publicDir);
});

it("漫画直接写入个人目录，修改配置后仍可重试与导出", async () => {
  const settings = await setup();
  built!.context.downloadDirectory.save(settings);
  await installMockSource(built!.context);
  await initializeApp(built!.context);
  const task = built!.context.downloads.create({
    sourceKey: "mock",
    comicId: "custom",
    episodeId: "chapter-1",
    destination: "personal",
  });
  built!.context.downloadDirectory.save({
    ...settings,
    personalDir: path.join(directory, "new-personal"),
  });
  await vi.waitFor(() => expect(built!.context.downloads.find(task.id)?.status).toBe("completed"));
  const completed = built!.context.downloads.find(task.id)!;
  expect(completed.outputDir?.startsWith(settings.personalDir + path.sep)).toBe(true);
  const exported = await built!.context.downloads.openCbz(task.id);
  expect(exported?.path.startsWith(settings.personalDir + path.sep)).toBe(true);
  exported?.stream.destroy();
  const shared = built!.context.downloads.create({
    sourceKey: "mock",
    comicId: "custom",
    episodeId: "chapter-1",
    destination: "public",
  });
  await vi.waitFor(() =>
    expect(built!.context.downloads.find(shared.id)?.status).toBe("completed"),
  );
  const sharedDirectory = built!.context.downloads.find(shared.id)!.outputDir!;
  await built!.context.downloads.delete(task.id, true);
  expect((await stat(sharedDirectory)).isDirectory()).toBe(true);
  expect(built!.context.downloads.find(shared.id)?.destination).toBe("public");
});

it("历史任务根据实际目录识别归属，旧默认设置作为公共目录", async () => {
  const settings = await setup();
  expect(built!.context.downloadDirectory.settings()).toMatchObject({
    publicDir: path.join(directory, "downloads"),
    personalDir: path.join(directory, "downloads-personal"),
    defaultDestination: "public",
  });
  built!.context.storage.setSetting("downloadDir", settings.publicDir);
  expect(built!.context.downloadDirectory.settings().publicDir).toBe(settings.publicDir);
  built!.context.downloadDirectory.save(settings);
  for (const [downloadDir, expected] of [
    [settings.publicDir, "public"],
    [settings.personalDir, "personal"],
    [path.join(directory, "old"), "custom"],
  ]) {
    await mkdir(downloadDir, { recursive: true });
    const task = built!.context.downloads.create({
      sourceKey: "old",
      comicId: expected,
      downloadDir,
    });
    const { destination: _destination, ...legacy } = task;
    built!.context.storage.saveDownload(legacy);
    expect(built!.context.downloads.find(task.id)?.destination).toBe(expected);
  }
});

it("小说双目的地直接生成 EPUB/TXT，配置变更、暂停与重启后仍保持个人路径", async () => {
  const settings = await setup();
  built!.context.downloadDirectory.save(settings);
  const source = built!.context.novelSources.import({
    bookSourceName: "测试小说源",
    bookSourceUrl: "https://novel.test",
    searchUrl: "/search?q={{key}}",
    ruleSearch: { bookList: ".book", name: "text", bookUrl: "href" },
    ruleToc: { chapterList: ".chapter", chapterName: "text", chapterUrl: "href" },
    ruleContent: { content: ".content@text" },
  }).sources[0];
  const book = { name: "测试小说", bookUrl: "https://novel.test/book" };
  const request = async (destination: string) => {
    const response = await built!.app.inject({
      method: "POST",
      url: "/api/v1/novels/downloads",
      payload: { sourceId: source.id, book, destination },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  // 外部内容解析以固定目录和正文模拟，真实运行调度、缓存和文件导出。
  vi.spyOn(NovelEngineExecutor.prototype, "execute").mockImplementation(
    async (operation) =>
      (operation === "catalog"
        ? {
            bookUrl: book.bookUrl,
            tocUrl: "https://novel.test/toc",
            tocComplete: true,
            tocPages: 1,
            chapters: [{ title: "第一章", url: "https://novel.test/chapter" }],
          }
        : "测试章节正文") as never,
  );
  const personal = await request("personal");
  const shared = await request("public");
  expect(personal.id).not.toBe(shared.id);
  expect((await request("personal")).id).toBe(personal.id);
  expect(personal.downloadDir).toBe(path.join(settings.personalDir, "novels"));
  expect(shared.downloadDir).toBe(path.join(settings.publicDir, "novels"));
  await built!.context.novelDownloads.action(personal.id, "pause");
  built!.context.downloadDirectory.save({
    ...settings,
    personalDir: path.join(directory, "new-personal"),
    defaultDestination: "personal",
  });
  await built!.app.close();
  built = await buildApp(undefined, { ...readConfig(), dataDir: directory });
  expect(built.context.novelDownloads.all().find((task) => task.id === personal.id)).toMatchObject({
    status: "paused",
    downloadDir: personal.downloadDir,
    destination: "personal",
  });
  await initializeApp(built.context);
  await built.context.novelDownloads.action(personal.id, "resume");
  await vi.waitFor(() =>
    expect(built!.context.novelDownloads.all().every((task) => task.status === "completed")).toBe(
      true,
    ),
  );
  for (const task of [personal, shared]) {
    for (const format of ["epub", "txt"]) {
      expect(
        (await stat(path.join(task.downloadDir, task.id, `book.${format}`))).size,
      ).toBeGreaterThan(0);
    }
  }
  const exported = await built.context.novelDownloads.openExport(personal.id, "epub");
  exported.stream.destroy();
  await built.context.novelDownloads.delete(shared.id);
  expect(
    (await stat(path.join(personal.downloadDir, personal.id, "book.epub"))).size,
  ).toBeGreaterThan(0);
  const next = await request("personal");
  expect(next.downloadDir).toBe(path.join(directory, "new-personal", "novels"));
  expect(next.id).not.toBe(personal.id);
});
