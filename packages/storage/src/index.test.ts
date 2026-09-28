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
