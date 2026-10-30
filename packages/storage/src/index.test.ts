import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStorage, type DownloadTask } from "./index.js";

describe("storage migrations", () => {
  it("creates a database without reading history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-storage-test-"));
    try {
      const storage = createStorage(dir);
      storage.close();
      const db = new Database(path.join(dir, "mansou.sqlite"));
      try {
        expect(
          db.prepare("select name from sqlite_master where name = 'history'").get(),
        ).toBeUndefined();
      } finally {
        db.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([1, 3, 4, 5, 6])(
    "opens a version %i database without changing existing history",
    async (version) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-storage-test-"));
      try {
        const initial = createStorage(dir);
        initial.close();
        const db = new Database(path.join(dir, "mansou.sqlite"));
        try {
          db.prepare("delete from schema_migrations where version > ?").run(version);
          if (version < 6) db.exec("drop index idx_download_items_task_order");
          db.exec(
            "create table history (id text primary key, page integer); insert into history values ('mock:comic-1', 3)",
          );
        } finally {
          db.close();
        }
        const storage = createStorage(dir);
        try {
          storage.setPluginData("mock", "key", "value");
          expect(storage.getPluginData("mock", "key")).toBe("value");
        } finally {
          storage.close();
        }
        const reopened = new Database(path.join(dir, "mansou.sqlite"));
        try {
          expect(reopened.prepare("select * from history").all()).toEqual([
            { id: "mock:comic-1", page: 3 },
          ]);
          expect(
            reopened.prepare("select max(version) as version from schema_migrations").get(),
          ).toEqual({ version: 6 });
        } finally {
          reopened.close();
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});

it("upgrades an existing version 5 database without changing image records and avoids temporary page sorting", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-storage-page-index-"));
  try {
    const initial = createStorage(dir);
    for (const imageKey of ["z", "a", "m"])
      initial.saveDownloadItem({
        taskId: "task",
        imageKey,
        status: imageKey === "m" ? "failed" : "completed",
        filePath: `/downloads/${imageKey}.jpg`,
      });
    const before = initial.listDownloadItems("task");
    initial.close();
    const legacy = new Database(path.join(dir, "mansou.sqlite"));
    legacy.exec(
      "drop index idx_download_items_task_order; delete from schema_migrations where version = 6",
    );
    legacy.close();
    const upgraded = createStorage(dir);
    try {
      expect(upgraded.listDownloadItems("task")).toEqual(before);
      expect(upgraded.listDownloadItemsPage("task", 1, 1, false)).toMatchObject({
        total: 3,
        failedTotal: 1,
        items: [{ image_key: "m" }],
      });
      expect(
        upgraded.listDownloadItemsPage("task", 0, 100, true).items.map((item) => item.image_key),
      ).toEqual(["m"]);
    } finally {
      upgraded.close();
    }
    const verified = new Database(path.join(dir, "mansou.sqlite"));
    try {
      const plan = verified
        .prepare(
          "explain query plan select * from download_items where task_id = ? order by id asc limit ? offset ?",
        )
        .all("task", 1, 1) as Array<{ detail: string }>;
      expect(plan.some((step) => step.detail.includes("TEMP B-TREE"))).toBe(false);
      expect(plan.some((step) => step.detail.includes("idx_download_items_task_order"))).toBe(true);
    } finally {
      verified.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("download item lookup", () => {
  it("selects ordered failed keys for one task and observes successful retries and deletions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-failed-keys-"));
    const storage = createStorage(dir);
    try {
      storage.saveDownloadItem({ taskId: "task", imageKey: "z", status: "failed" });
      storage.saveDownloadItem({ taskId: "task", imageKey: "a", status: "failed" });
      storage.saveDownloadItem({
        taskId: "task",
        imageKey: "error-only",
        status: "completed",
        error: "notice",
      });
      storage.saveDownloadItem({ taskId: "other", imageKey: "foreign", status: "failed" });
      expect(storage.listFailedDownloadImageKeys("task")).toEqual(["a", "z"]);
      storage.saveDownloadItem({ taskId: "task", imageKey: "a", status: "completed" });
      expect(storage.listFailedDownloadImageKeys("task")).toEqual(["z"]);
      storage.deleteDownloadItems("task");
      expect(storage.listFailedDownloadImageKeys("task")).toEqual([]);
      expect(storage.listFailedDownloadImageKeys("other")).toEqual(["foreign"]);
    } finally {
      storage.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("retrieves the exact persisted image and observes updates and deletions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-storage-items-"));
    const storage = createStorage(dir);
    try {
      for (const taskId of ["first", "second"])
        storage.saveDownloadItem({ taskId, imageKey: "shared", status: "failed" });
      storage.saveDownloadItem({
        taskId: "first",
        imageKey: "shared",
        status: "completed",
        filePath: "/downloads/page.jpg",
      });
      expect(storage.getDownloadItem("first", "shared")).toMatchObject({
        task_id: "first",
        image_key: "shared",
        status: "completed",
        file_path: "/downloads/page.jpg",
      });
      expect(storage.getDownloadItem("second", "shared")?.status).toBe("failed");
      expect(storage.getDownloadItem("first", "missing")).toBeNull();
      storage.deleteDownloadItems("first");
      expect(storage.getDownloadItem("first", "shared")).toBeNull();
      expect(storage.getDownloadItem("second", "shared")?.status).toBe("failed");
    } finally {
      storage.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not return a different task or image when separator-containing keys share an id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-storage-items-"));
    const storage = createStorage(dir);
    try {
      storage.saveDownloadItem({ taskId: "task:part", imageKey: "image", status: "completed" });
      expect(storage.getDownloadItem("task:part", "image")?.status).toBe("completed");
      expect(storage.getDownloadItem("task", "part:image")).toBeNull();
    } finally {
      storage.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it("lists only queued task ids in creation order and observes state transitions", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-storage-queue-"));
  const storage = createStorage(dir);
  try {
    const task = (id: string, status: DownloadTask["status"], createdAt: string): DownloadTask => ({
      id,
      status,
      createdAt,
      updatedAt: createdAt,
      phase: "queued",
      sourceKey: "mock",
      comicId: id,
      episodeId: "chapter",
      total: 0,
      completed: 0,
      logs: [],
    });
    const later = task("later", "queued", "2026-10-30T01:00:00Z");
    const earlier = task("earlier", "queued", "2026-10-30T00:00:00Z");
    storage.saveDownload(later);
    for (const status of ["running", "paused", "completed", "failed", "cancelled"] as const)
      storage.saveDownload(task(status, status, "2026-10-29T00:00:00Z"));
    storage.saveDownload(earlier);
    expect(storage.listQueuedDownloadIds()).toEqual(["earlier", "later"]);
    storage.saveDownload({ ...earlier, status: "running" });
    expect(storage.listQueuedDownloadIds()).toEqual(["later"]);
    storage.deleteDownload(later.id);
    expect(storage.listQueuedDownloadIds()).toEqual([]);
    storage.saveDownload({ ...earlier, status: "queued" });
    expect(storage.listQueuedDownloadIds()).toEqual(["earlier"]);
  } finally {
    storage.close();
    await rm(dir, { recursive: true, force: true });
  }
});
