import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStorage } from "./index.js";

describe("storage migrations", () => {
  it("creates a database without reading history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "venera-storage-test-"));
    try {
      const storage = createStorage(dir);
      storage.close();
      const db = new Database(path.join(dir, "venera_web.sqlite"));
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

  it.each([1, 3, 4, 5])(
    "opens a version %i database without changing existing history",
    async (version) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "venera-storage-test-"));
      try {
        const initial = createStorage(dir);
        initial.close();
        const db = new Database(path.join(dir, "venera_web.sqlite"));
        try {
          db.prepare("delete from schema_migrations where version > ?").run(version);
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
        const reopened = new Database(path.join(dir, "venera_web.sqlite"));
        try {
          expect(reopened.prepare("select * from history").all()).toEqual([
            { id: "mock:comic-1", page: 3 },
          ]);
          expect(
            reopened.prepare("select max(version) as version from schema_migrations").get(),
          ).toEqual({ version: 5 });
        } finally {
          reopened.close();
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("download item lookup", () => {
  it("retrieves the exact persisted image and observes updates and deletions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "venera-storage-items-"));
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
    const dir = await mkdtemp(path.join(os.tmpdir(), "venera-storage-items-"));
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
