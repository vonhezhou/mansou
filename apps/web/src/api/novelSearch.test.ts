import { afterEach, expect, it, vi } from "vitest";
import { searchNovels } from "./novelSearch.js";
import { setCsrfToken } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken("");
});
const encoder = new TextEncoder();
const start = { type: "start", keyword: "凡人", page: 1, totalSources: 3 };
const source = (id: string, author = "测试作者") => ({
  type: "source",
  elapsedMs: 1,
  source: {
    sourceId: id,
    sourceName: id,
    status: "ok",
    elapsedMs: 1,
    books: [{ name: "凡人测试", author, bookUrl: `https://${id}.test/book` }],
  },
});
const complete = { type: "complete", elapsedMs: 3, cancelled: false };
const encode = (...events: unknown[]) =>
  encoder.encode(events.map((event) => JSON.stringify(event) + "\n").join(""));

it("逐源更新、合并来源，并正确解析跨网络分块的中文和多行事件", async () => {
  const bytes = encode(start, source("one"), source("two"), source("three", ""), complete);
  const updates: any[] = [];
  setCsrfToken("csrf-test");
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            // 每次一个字节，覆盖 UTF-8 字符和 JSON 行被截断的情况。
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  await searchNovels("凡人", 1, (result) => updates.push(result));
  expect(updates.map((result) => result.completedSources)).toEqual([0, 1, 2, 3, 3]);
  expect(updates[1].results[0].origins).toHaveLength(1);
  expect(updates[2].results[0].origins).toHaveLength(2);
  expect(updates[3].results).toHaveLength(2);
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("x-csrf-token")).toBe("csrf-test");
  expect(fetcher.mock.calls[0][1]?.credentials).toBe("same-origin");
});

it.each(["断开", "错误事件", "损坏数据"])("%s 保留已经推送的结果并报告失败", async (mode) => {
  const bytes = encode(start, source("one"));
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              if (mode === "错误事件")
                controller.enqueue(encode({ type: "error", message: "搜索故障" }));
              if (mode === "损坏数据") controller.enqueue(encoder.encode("invalid\n"));
              controller.close();
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        ),
    ),
  );
  const updates: any[] = [];
  await expect(searchNovels("凡人", 1, (result) => updates.push(result))).rejects.toThrow();
  expect(updates.at(-1).completedSources).toBe(1);
  expect(updates.at(-1).results[0].name).toBe("凡人测试");
});

it("取消时释放未结束的响应读取，停止后续更新", async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encode(start, source("one")));
            },
            cancel,
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        ),
    ),
  );
  const controller = new AbortController();
  const updates: any[] = [];
  await expect(
    searchNovels(
      "凡人",
      1,
      (result) => {
        updates.push(result);
        if (result.completedSources) controller.abort();
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(updates).toHaveLength(2);
  expect(cancel).toHaveBeenCalledOnce();
});
