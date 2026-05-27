import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStorage } from "./index.js";

describe("storage migrations", () => {
  it("persists history title and cover", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "venera-storage-test-"));
    const storage = createStorage(dir);
    try {
      storage.saveHistory({ sourceKey: "mock", comicId: "comic-1", title: "Title", cover: "cover", episodeId: "chapter-1", page: 3, progress: 0.5 });
      expect(storage.getHistory("mock", "comic-1")).toMatchObject({ title: "Title", cover: "cover", episode_id: "chapter-1", page: 3 });

      storage.saveHistory({ sourceKey: "mock", comicId: "comic-1", episodeId: "chapter-2", page: 1, progress: 0.2 });
      expect(storage.getHistory("mock", "comic-1")).toMatchObject({ title: "Title", cover: "cover", episode_id: "chapter-2", page: 1 });
    } finally {
      storage.close();
    }
  });
});
