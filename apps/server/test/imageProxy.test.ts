import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SourceProvider, SourceRegistry } from "@mansou/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageCache } from "../src/storage/imageCache.js";
import { ImageProxyService } from "../src/services/imageProxy.js";

let directory: string;
const releases: Array<() => void> = [];
const active: Promise<unknown>[] = [];
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-image-proxy-"));
});
afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  await Promise.allSettled(active.splice(0));
  await rm(directory, { recursive: true, force: true });
});

it("reads existing cache but does not write or retain cold download bytes", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  const write = vi.spyOn(cache, "write");
  expect(await proxy.loadBytes(input, "read-only")).toMatchObject({
    data: image.data,
    cached: false,
  });
  expect(await cache.cacheStats()).toEqual({ files: 0, bytes: 0 });
  expect(write).not.toHaveBeenCalled();
  await proxy.loadBytes(input, "read-only");
  expect(loadImageBytes).toHaveBeenCalledTimes(2);
  await proxy.loadBytes(input);
  expect(await proxy.loadBytes(input, "read-only")).toMatchObject({
    data: image.data,
    cached: true,
  });
  expect(loadImageBytes).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenCalledOnce();
});

it.each([true, false])(
  "shares mixed preview and download requests when downloadFirst=%s",
  async (downloadFirst) => {
    const { proxy, cache, loadImageBytes } = setup();
    const write = vi.spyOn(cache, "write");
    const results = await Promise.all([
      proxy.loadBytes(input, downloadFirst ? "read-only" : true),
      proxy.loadBytes(input, downloadFirst ? true : "read-only"),
    ]);
    expect(loadImageBytes).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(results.every((result) => result.data.equals(image.data))).toBe(true);
    expect(await proxy.loadBytes(input, "read-only")).toMatchObject({ cached: true });
  },
);

it("keeps merging requests while a preview cache write is pending without blocking a download on that write", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const writing = new Promise<void>((done) => {
    entered = done;
  });
  releases.push(release);
  const original = cache.write.bind(cache);
  const write = vi.spyOn(cache, "write").mockImplementationOnce(async (...args) => {
    entered();
    await gate;
    return original(...args);
  });
  const preview = proxy.loadBytes(input);
  active.push(preview);
  await writing;
  const download = proxy.loadBytes(input, "read-only");
  active.push(download);
  const anotherPreview = proxy.loadBytes(input);
  active.push(anotherPreview);
  try {
    expect(await download).toMatchObject({ data: image.data, cached: false });
    expect(loadImageBytes).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
  } finally {
    release();
    await Promise.all([preview, anotherPreview]);
  }
  expect(await proxy.loadBytes(input)).toMatchObject({ cached: true });
});

it("isolates preview cache-write failures from a concurrent download", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  vi.spyOn(cache, "write").mockRejectedValueOnce(new Error("disk full"));
  const [preview, download] = await Promise.allSettled([
    proxy.loadBytes(input),
    proxy.loadBytes(input, "read-only"),
  ]);
  expect(preview.status).toBe("rejected");
  expect(download).toMatchObject({ status: "fulfilled", value: { data: image.data } });
  expect(loadImageBytes).toHaveBeenCalledOnce();
  await expect(proxy.loadBytes(input)).resolves.toMatchObject({ data: image.data });
  expect(loadImageBytes).toHaveBeenCalledTimes(2);
});

it("retries a failed cache-read-only upstream request without caching its rejection", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  loadImageBytes.mockRejectedValueOnce(new Error("upstream unavailable"));
  await expect(proxy.loadBytes(input, "read-only")).rejects.toThrow("upstream unavailable");
  await expect(proxy.loadBytes(input, "read-only")).resolves.toMatchObject({ data: image.data });
  expect(loadImageBytes).toHaveBeenCalledTimes(2);
  expect(await cache.cacheStats()).toEqual({ files: 0, bytes: 0 });
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

it("shares concurrent cache-populating requests including different property orders", async () => {
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

it("reuses disk cache between sequential preview and download requests after restart", async () => {
  const { proxy, cache, loadImageBytes } = setup();
  // HTTP 查询参数的顺序与下载器构造的参数顺序不同。
  await proxy.loadBytes({
    sourceKey: "source",
    imageKey: "image",
    comicId: "comic",
    episodeId: "chapter",
  });
  const restarted = new ImageProxyService(
    { get: () => ({ loadImageBytes }) as unknown as SourceProvider, list: () => [] },
    cache,
  );
  expect(await restarted.loadBytes(input)).toEqual({
    data: image.data,
    contentType: "image/jpeg",
    cached: true,
  });
  expect(loadImageBytes).toHaveBeenCalledOnce();
  expect(await cache.cacheStats()).toEqual({ files: 1, bytes: image.data.length });
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
    { ...input, sourceKey: "a:shared" },
    { ...input, sourceKey: "b:shared" },
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
