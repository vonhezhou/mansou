import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SourceProvider, SourceRegistry } from "@venera/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageCache } from "../src/storage/imageCache.js";
import { ImageProxyService } from "../src/services/imageProxy.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "venera-image-proxy-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const input = { sourceKey: "source", comicId: "comic", episodeId: "chapter", imageKey: "image" };
const image = { data: Buffer.from([0xff, 0xd8, 0xff]), contentType: "application/octet-stream" };

function setup() {
  const loadImageBytes = vi.fn<SourceProvider["loadImageBytes"]>().mockResolvedValue(image);
  const sources: SourceRegistry = {
    get: () => ({ loadImageBytes }) as unknown as SourceProvider,
    list: () => [],
  };
  const cache = new ImageCache(directory, 1000);
  return { proxy: new ImageProxyService(sources, cache), cache, loadImageBytes };
}

it("shares concurrent preview and download requests including different property orders", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  const write = vi.spyOn(cache, "write");
  const reordered = {
    imageKey: "image",
    episodeId: "chapter",
    comicId: "comic",
    sourceKey: "source",
  };
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) => proxy.loadBytes(index % 2 ? reordered : input)),
  );
  expect(loadImageBytes).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledOnce();
  for (const result of results)
    expect(result).toEqual({ data: image.data, contentType: "image/jpeg", cached: false });
  expect(await proxy.loadBytes(input)).toEqual({
    data: image.data,
    contentType: "image/jpeg",
    cached: true,
  });
  expect(loadImageBytes).toHaveBeenCalledOnce();
});

it("does not retain completed bytes in memory after the disk cache is cleared", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  await proxy.loadBytes(input);
  await cache.clearCache();
  await proxy.loadBytes(input);
  expect(loadImageBytes).toHaveBeenCalledTimes(2);
});

it("releases failed upstream and cache-write requests so subsequent calls can retry", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  loadImageBytes.mockRejectedValueOnce(new Error("upstream failed"));
  const failed = await Promise.allSettled([proxy.loadBytes(input), proxy.loadBytes(input)]);
  expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(loadImageBytes).toHaveBeenCalledOnce();
  vi.spyOn(cache, "write").mockRejectedValueOnce(new Error("disk full"));
  await expect(proxy.loadBytes(input)).rejects.toThrow("disk full");
  await expect(proxy.loadBytes(input)).resolves.toMatchObject({ data: image.data });
  expect(loadImageBytes).toHaveBeenCalledTimes(3);
});

it("keeps cache-bypassing requests independent of cached requests", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  const write = vi.spyOn(cache, "write");
  const results = await Promise.all([
    proxy.loadBytes(input),
    proxy.loadBytes(input, false),
    proxy.loadBytes(input, false),
  ]);
  expect(loadImageBytes).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenCalledOnce();
  expect(results.every((result) => !result.cached)).toBe(true);
});

it("loads distinct image contexts concurrently without mixing source or variant bytes", async () => {
  const { proxy, loadImageBytes } = setup();
  const requests = [
    input,
    { ...input, sourceKey: "other" },
    { ...input, comicId: "other" },
    { ...input, episodeId: "other" },
    { ...input, imageKey: "other" },
    { ...input, thumbnail: true },
    { ...input, thumbnail: false },
    { ...input, episodeId: null },
    { ...input, episodeId: undefined },
  ];
  const releases: Array<() => void> = [];
  loadImageBytes.mockImplementation(
    (request) =>
      new Promise((resolve) => {
        releases.push(() =>
          resolve({ data: Buffer.from(JSON.stringify(request)), contentType: "image/custom" }),
        );
      }),
  );
  const pending = Promise.all(requests.map((request) => proxy.loadBytes(request)));
  try {
    await vi.waitFor(() => expect(loadImageBytes).toHaveBeenCalledTimes(requests.length));
  } finally {
    releases.forEach((release) => release());
  }
  const results = await pending;
  results.forEach((result, index) => {
    expect(result.data.toString()).toBe(JSON.stringify(requests[index]));
    expect(result.contentType).toBe("image/custom");
  });
});
