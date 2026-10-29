import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ImageCache } from "../src/storage/imageCache.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "venera-image-cache-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("evicts the least recently used image while preserving recently read bytes", async () => {
  const cache = new ImageCache(directory, 6);
  await cache.write("a", Buffer.from("aaa"));
  await cache.write("b", Buffer.from("bbb"));
  expect((await cache.read("a"))?.toString()).toBe("aaa");
  await cache.write("c", Buffer.from("ccc"));
  expect(await cache.read("b")).toBeUndefined();
  expect((await cache.read("a"))?.toString()).toBe("aaa");
  expect((await cache.read("c"))?.toString()).toBe("ccc");
  expect(await cache.cacheStats()).toEqual({ files: 2, bytes: 6 });
});

it("accounts for overwrites and serializes concurrent writes and clearing", async () => {
  const cache = new ImageCache(directory, 100);
  await Promise.all([
    cache.write("same", Buffer.alloc(30, 1)),
    cache.write("same", Buffer.alloc(50, 2)),
    cache.write("other", Buffer.alloc(20, 3)),
  ]);
  expect(await cache.cacheStats()).toEqual({ files: 2, bytes: 70 });
  expect(await cache.read("same")).toEqual(Buffer.alloc(50, 2));
  expect((await readdir(directory)).every((file) => file.endsWith(".bin"))).toBe(true);
  await Promise.all([cache.clearCache(), cache.write("after", Buffer.from("new"))]);
  expect(await cache.cacheStats()).toEqual({ files: 1, bytes: 3 });
  expect(await cache.read("same")).toBeUndefined();
  expect((await cache.read("after"))?.toString()).toBe("new");
});

it("rebuilds the index after restart and reconciles externally modified files on explicit maintenance", async () => {
  const cache = new ImageCache(directory, 10);
  await cache.write("image", Buffer.alloc(3));
  const restarted = new ImageCache(directory, 10);
  expect(await restarted.cacheStats()).toEqual({ files: 1, bytes: 3 });
  await rm(directory, { recursive: true });
  await mkdir(path.join(directory, "nested"), { recursive: true });
  await writeFile(path.join(directory, "nested", "old.bin"), Buffer.alloc(20));
  expect(await restarted.enforceCacheLimit()).toEqual({ files: 0, bytes: 0 });
  await restarted.write("new", Buffer.alloc(5));
  expect(await restarted.cacheStats()).toEqual({ files: 1, bytes: 5 });
});

it("preserves an unlimited cache and removes oversized entries from a bounded cache", async () => {
  const unlimited = new ImageCache(directory, 0);
  await unlimited.write("image", Buffer.alloc(20));
  expect(await unlimited.cacheStats()).toEqual({ files: 1, bytes: 20 });
  const bounded = new ImageCache(directory, 10);
  expect(await bounded.enforceCacheLimit()).toEqual({ files: 0, bytes: 0 });
  await bounded.write("oversized", Buffer.alloc(11));
  expect(await bounded.read("oversized")).toBeUndefined();
});

it("recovers after a filesystem failure instead of poisoning later writes", async () => {
  const blocked = path.join(directory, "blocked");
  await writeFile(blocked, "not a directory");
  const cache = new ImageCache(blocked, 10);
  await expect(cache.write("image", Buffer.alloc(3))).rejects.toThrow();
  await rm(blocked);
  await cache.write("image", Buffer.alloc(3));
  expect(await cache.cacheStats()).toEqual({ files: 1, bytes: 3 });
});
