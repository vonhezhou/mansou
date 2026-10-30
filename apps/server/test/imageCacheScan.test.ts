import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageCache } from "../src/storage/imageCache.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  stat: vi.fn(),
}));
let directory: string;
let actual: typeof fs;
const releases: Array<() => void> = [];
beforeEach(async () => {
  actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.stat).mockReset().mockImplementation(actual.stat);
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "venera-cache-scan-"));
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      fs.writeFile(path.join(directory, `${index}.bin`), "image"),
    ),
  );
});
afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});
it("bounds metadata IO and completes all checks before allowing a queued clear", async () => {
  vi.mocked(fs.stat).mockImplementation(
    (...args) =>
      new Promise((resolve, reject) => {
        releases.push(() => {
          actual.stat(...args).then(resolve, reject);
        });
      }),
  );
  const cache = new ImageCache(directory, 0);
  const stats = cache.cacheStats();
  await vi.waitFor(() => expect(fs.stat).toHaveBeenCalledTimes(8));
  const clearing = cache.clearCache();
  expect(await fs.readdir(directory)).toHaveLength(12);
  releases.splice(0).forEach((release) => release());
  await vi.waitFor(() => expect(fs.stat).toHaveBeenCalledTimes(12));
  releases.splice(0).forEach((release) => release());
  expect(await stats).toEqual({ files: 12, bytes: 60 });
  expect(await clearing).toEqual({ files: 0, bytes: 0 });
});
it("waits for in-flight queries on failure and can rebuild the index afterwards", async () => {
  const failure = Object.assign(new Error("stat failed"), { code: "EACCES" });
  vi.mocked(fs.stat)
    .mockRejectedValueOnce(failure)
    .mockImplementation(
      (...args) =>
        new Promise((resolve, reject) => {
          releases.push(() => {
            actual.stat(...args).then(resolve, reject);
          });
        }),
    );
  const cache = new ImageCache(directory, 0);
  const pending = cache.cacheStats();
  const rejected = expect(pending).rejects.toBe(failure);
  const settled = vi.fn();
  void pending.then(settled, settled);
  await vi.waitFor(() => expect(fs.stat).toHaveBeenCalledTimes(8));
  expect(settled).not.toHaveBeenCalled();
  vi.mocked(fs.stat).mockImplementation(actual.stat);
  releases.splice(0).forEach((release) => release());
  await rejected;
  expect(await cache.cacheStats()).toEqual({ files: 12, bytes: 60 });
});
