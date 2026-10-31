import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { novelApi, type NovelCatalog, type NovelOrigin, type NovelSource } from "../api/novels.js";
import { useNovelCatalog } from "./useNovelCatalog.js";

const source: NovelSource = {
  id: "s",
  groupId: "local",
  name: "测试源",
  url: "https://novel.test",
  hash: "v1",
  enabled: true,
  searchSupported: true,
  downloadSupported: true,
};
const origin = (id = "a"): NovelOrigin => ({
  sourceId: source.id,
  sourceName: source.name,
  name: id,
  author: "作者",
  bookUrl: `https://novel.test/${id}`,
});
const catalog = (id = "a", count = 2, complete = true): NovelCatalog => ({
  bookUrl: origin(id).bookUrl,
  tocUrl: `https://novel.test/${id}/toc`,
  tocComplete: complete,
  tocPages: 1,
  chapters: Array.from({ length: count }, (_, index) => ({
    title: `${id}第${index + 1}章`,
    url: `https://novel.test/${id}/${index + 1}`,
  })),
});
let root: Root, container: HTMLDivElement, state: ReturnType<typeof useNovelCatalog>;
let unmounted = false;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  unmounted = false;
  function Harness() {
    state = useNovelCatalog();
    return null;
  }
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const load = (id = "a", current = source, refresh = false) =>
  act(async () => state.load(origin(id), current, refresh));

it("重复打开复用目录，刷新、规则变化、书籍变化及一分钟过期会重新请求", async () => {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetch = vi
    .spyOn(novelApi, "catalog")
    .mockImplementation(async (book) => catalog(book.name));
  await load();
  await act(async () => state.close());
  await load();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.catalog?.bookUrl).toBe(origin().bookUrl);
  await load("a", source, true);
  expect(fetch).toHaveBeenCalledTimes(2);
  const updated = { ...source, hash: "v2" };
  await load("a", updated);
  expect(fetch).toHaveBeenCalledTimes(3);
  await load("b", updated);
  expect(fetch).toHaveBeenCalledTimes(4);
  now += 60_001;
  await load("b", updated);
  expect(fetch).toHaveBeenCalledTimes(5);
  await load("b", { ...updated, enabled: false });
  expect(state.catalog).toBeUndefined();
  expect(state.error).toContain("停用");
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("不缓存不完整或失败目录，强制刷新失败后不会恢复旧缓存冒充成功", async () => {
  const fetch = vi.spyOn(novelApi, "catalog").mockResolvedValue(catalog());
  await load();
  fetch.mockRejectedValueOnce(new Error("上游失败"));
  await load("a", source, true);
  expect(state.error).toBe("上游失败");
  expect(state.catalog).toBeUndefined();
  await load();
  expect(fetch).toHaveBeenCalledTimes(3);
  fetch.mockResolvedValue(catalog("partial", 2, false));
  await load("partial");
  await load("partial");
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("缓存同时限制三个目录及一万项总预算，超大目录不留在缓存中", async () => {
  const fetch = vi
    .spyOn(novelApi, "catalog")
    .mockImplementation(async (book) => catalog(book.name));
  for (const id of ["a", "b", "c", "d"]) await load(id);
  await load("a");
  expect(fetch).toHaveBeenCalledTimes(5);
  fetch.mockImplementation(async (book) => catalog(book.name, 6000));
  await load("large-a");
  await load("large-b");
  await load("large-a");
  expect(fetch).toHaveBeenCalledTimes(8);
  fetch.mockResolvedValue(catalog("huge", 10_001));
  await load("huge");
  await load("huge");
  expect(fetch).toHaveBeenCalledTimes(10);
});

it.each(["成功", "失败"])("切源后忽略旧请求迟到的%s，关闭与卸载均取消在途请求", async (mode) => {
  const requests: Array<{
    signal?: AbortSignal;
    resolve: (value: NovelCatalog) => void;
    reject: (error: Error) => void;
  }> = [];
  vi.spyOn(novelApi, "catalog").mockImplementation(
    (_book, signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })),
  );
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => {
    first = state.load(origin("a"), source);
  });
  await act(async () => {
    second = state.load(origin("b"), source);
  });
  expect(requests[0].signal?.aborted).toBe(true);
  await act(async () => {
    if (mode === "成功") requests[0].resolve(catalog());
    else requests[0].reject(new Error("旧错误"));
    await first;
  });
  expect(state.origin?.name).toBe("b");
  expect(state.loading).toBe(true);
  expect(state.catalog).toBeUndefined();
  expect(state.error).toBeUndefined();
  await act(async () => {
    requests[1].resolve(catalog("b"));
    await second;
  });
  expect(state.catalog?.bookUrl).toBe(origin("b").bookUrl);
  expect(state.loading).toBe(false);
  await act(async () => {
    first = state.load(origin("c"), source);
  });
  await act(async () => state.close());
  expect(requests[2].signal?.aborted).toBe(true);
  expect(state.loading).toBe(false);
  await act(async () => {
    requests[2].resolve(catalog("c"));
    await first;
  });
  expect(state.origin).toBeUndefined();
  await act(async () => {
    first = state.load(origin("c"), source);
  });
  expect(requests).toHaveLength(4);
  await act(async () => root.unmount());
  unmounted = true;
  expect(requests[3].signal?.aborted).toBe(true);
  await act(async () => {
    requests[3].resolve(catalog("c"));
    await first;
  });
});
