import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStorage } from "@mansou/storage";
import { SourceQualityService } from "../src/services/sourceQuality.js";

let directory: string;
let db: ReturnType<typeof createStorage>;
let quality: SourceQualityService;
let now: number;
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "mansou-quality-"));
  db = createStorage(directory);
  now = Date.UTC(2026, 10, 15);
  quality = new SourceQualityService(db.sourceQuality, () => now);
  quality.register("comic", "source", "v1");
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
const record = (errorCode?: string, id?: string) =>
  quality.record("comic", "source", "v1", {
    id,
    operation: "search",
    elapsedMs: 100,
    errorCode,
  });

it("空结果记可用成功，取消与能力错误排除，重复事件幂等且错误原文不入库", () => {
  record(undefined, "once");
  record("SECRET-TOKEN", "once");
  record("CANCELLED");
  record("SOURCE_CAPABILITY_UNSUPPORTED");
  record("UNSUPPORTED_RULE");
  expect(quality.snapshot("comic", "source").operations[0]).toMatchObject({
    successCount: 1,
    failureCount: 0,
    nonemptyCount: 0,
  });
  record("SECRET-TOKEN");
  expect(JSON.stringify(db.sourceQuality.get("comic", "source"))).not.toContain("SECRET-TOKEN");
});

it("异步作用域内取消的漫画调用不计失败", async () => {
  const controller = new AbortController();
  await quality.withSignal(controller.signal, async () => {
    await Promise.resolve();
    controller.abort();
    record("PLUGIN_TIMEOUT");
  });
  expect(quality.snapshot("comic", "source").operations).toEqual([]);
});

it("持续失败降级、冷却、重启恢复，试搜连续成功后恢复", () => {
  for (let index = 0; index < 3; index++) {
    record("PLUGIN_SOURCE_ERROR");
    now += 30_000;
  }
  expect(quality.snapshot("comic", "source").state).toBe("degraded");
  record("PLUGIN_SOURCE_ERROR");
  now += 30_000;
  record("PLUGIN_SOURCE_ERROR");
  const until = quality.snapshot("comic", "source").cooldownUntil;
  expect(quality.snapshot("comic", "source").state).toBe("isolated");
  db.close();
  db = createStorage(directory);
  quality = new SourceQualityService(db.sourceQuality, () => now);
  expect(quality.snapshot("comic", "source").cooldownUntil).toBe(until);
  now += 60_001;
  expect(quality.plan("comic", [{ key: "source" }]).sources).toHaveLength(1);
  record();
  expect(quality.snapshot("comic", "source").state).toBe("degraded");
  record();
  expect(quality.snapshot("comic", "source").state).not.toBe("degraded");
});

it("限流立即冷却，人工包含可试搜，登录受限保留分类", () => {
  record("PLUGIN_RATE_LIMITED");
  expect(quality.plan("comic", [{ key: "source" }]).skipped).toHaveLength(1);
  expect(quality.plan("comic", [{ key: "source" }], true).sources).toHaveLength(1);
  quality.register("comic", "source", "v2");
  quality.record("comic", "source", "v2", {
    operation: "search",
    elapsedMs: 1,
    errorCode: "SOURCE_LOGIN_FAILED",
  });
  expect(quality.snapshot("comic", "source").operations[0].lastError).toBe("restricted");
});

it("源类型和规则版本隔离，删除后迟到调用不能重建，内容统计与搜索分开", () => {
  record();
  quality.register("comic", "source", "v2");
  record("PLUGIN_TIMEOUT");
  expect(quality.snapshot("comic", "source").operations).toEqual([]);
  quality.register("novel", "source", "v1");
  quality.record("novel", "source", "v1", { operation: "content", elapsedMs: 10 });
  expect(quality.snapshot("novel", "source").operations[0].operation).toBe("content");
  expect(quality.snapshot("comic", "source").operations).toEqual([]);
  quality.delete("novel", "source");
  quality.record("novel", "source", "v1", { operation: "search", elapsedMs: 1 });
  expect(db.sourceQuality.get("novel", "source")).toBeUndefined();
});

it("时间桶与去重窗口有界，过期统计及失败状态退出评分", () => {
  for (let index = 0; index < 200; index++) {
    record(undefined, String(index));
    now += 3_600_000;
  }
  const stored = db.sourceQuality.get<any>("comic", "source");
  expect(stored.operations.search.buckets.length).toBeLessThanOrEqual(168);
  expect(stored.recentEvents).toHaveLength(128);
  now += 8 * 24 * 3_600_000;
  expect(quality.snapshot("comic", "source").operations[0]).toMatchObject({
    successCount: 0,
    failureCount: 0,
    state: "observing",
  });
});

it("集中网络故障不会把所有源推入持续失败状态", () => {
  for (const key of ["a", "b", "c"]) quality.register("comic", key, "v1");
  for (let round = 0; round < 6; round++) {
    for (const key of ["a", "b", "c"])
      quality.record("comic", key, "v1", {
        operation: "search",
        elapsedMs: 1,
        errorCode: "PLUGIN_NETWORK_ERROR",
      });
    now += 10_000;
  }
  for (const key of ["a", "b", "c"])
    expect(quality.snapshot("comic", key).state).not.toBe("isolated");
});

it("并发完成时计数完整，快速空结果的速度奖励低于有效命中", async () => {
  quality.register("comic", "hit", "v1");
  await Promise.all(
    Array.from({ length: 40 }, async () => {
      await Promise.resolve();
      record();
      quality.record("comic", "hit", "v1", { operation: "search", elapsedMs: 100, nonempty: true });
    }),
  );
  expect(quality.snapshot("comic", "source").operations[0].successCount).toBe(40);
  expect(quality.snapshot("comic", "hit").score).toBeGreaterThan(
    quality.snapshot("comic", "source").score,
  );
});

it("健康源优先，新源有探索名额，浏览器偏好不能解除冷却", () => {
  for (const key of ["fast", "slow", "new"]) quality.register("comic", key, "v1");
  for (let index = 0; index < 30; index++) {
    quality.record("comic", "fast", "v1", { operation: "search", elapsedMs: 100, nonempty: true });
    quality.record("comic", "slow", "v1", {
      operation: "search",
      elapsedMs: 30_000,
      nonempty: true,
    });
  }
  expect(
    quality.plan("comic", [{ key: "slow" }, { key: "fast" }, { key: "new" }]).sources[0].sourceKey,
  ).toBe("fast");
  record("PLUGIN_RATE_LIMITED");
  expect(quality.plan("comic", [{ key: "source" }], false, { source: 10 }).sources).toEqual([]);
});

it("小说真实 Worker 的限流会冷却，默认跳过并报告数量，显式重试可恢复", async () => {
  const { NovelEngineExecutor } = await import("../src/services/novels/engineExecutor.js");
  const { NovelSourceService } = await import("../src/services/novels/sourceService.js");
  let limited = true;
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response(
      limited ? "limited" : '<div class="book"><a href="/book">测试小说</a></div>',
      { status: limited ? 429 : 200 },
    );
  };
  const engine = new NovelEngineExecutor(fetcher, 1000, db.novels, quality);
  const sources = new NovelSourceService(db.novels, fetcher, 1000, engine, quality);
  try {
    const state = sources.import([
      {
        bookSourceName: "质量测试",
        bookSourceUrl: "https://quality.test",
        searchUrl: "/search?q={{key}}",
        ruleSearch: { bookList: ".book", name: "a@text", bookUrl: "a@href" },
        ruleToc: { chapterList: "a", chapterName: "text", chapterUrl: "href" },
        ruleContent: { content: ".content@text" },
      },
    ]);
    const key = state.sources[0].id;
    const failed = await sources.search("测试", 1);
    expect(failed.sources[0].error?.code).toBe("RATE_LIMITED");
    expect(sources.state().sources[0].quality?.state).toBe("isolated");
    const updates: any[] = [];
    const skipped = await sources.search("测试", 1, undefined, undefined, (update) => {
      updates.push(update);
    });
    expect(skipped).toMatchObject({
      candidateSources: 1,
      totalSources: 0,
      completedSources: 0,
      skippedSources: [{ sourceKey: key }],
    });
    expect(updates[0]).toMatchObject({
      candidateSources: 1,
      totalSources: 0,
      skippedSources: [{ sourceKey: key }],
    });
    expect(calls).toBe(1);
    limited = false;
    const retry = await sources.search("测试", 1, undefined, undefined, undefined, true);
    expect(retry.results).toHaveLength(1);
    expect(retry.skippedSources).toEqual([]);
    expect(sources.state().sources[0].quality?.state).toBe("degraded");
    await sources.search("测试", 1);
    expect(sources.state().sources[0].quality?.state).not.toBe("degraded");
    quality.delete("novel", key);
    new NovelSourceService(db.novels, fetcher, 1000, engine, quality);
    expect(quality.version("novel", key)).toBe(state.sources[0].hash);
    sources.deleteSource(key);
    expect(db.sourceQuality.get("novel", key)).toBeUndefined();
  } finally {
    await engine.close();
  }
});

it("受控快慢源基线中，排序提前有效结果且保留全量覆盖", async () => {
  const { searchAll } = await import("@mansou/novel-engine");
  const { vi } = await import("vitest");
  const keys = ["slow1", "slow2", "slow3", "fast"];
  for (const key of keys) {
    quality.register("comic", key, "v1");
    for (let index = 0; index < 30; index++)
      quality.record("comic", key, "v1", {
        operation: "search",
        elapsedMs: key === "fast" ? 10 : 1000,
        nonempty: key === "fast",
      });
  }
  vi.useFakeTimers();
  try {
    const measure = async (order: string[]) => {
      const started = Date.now();
      let firstResultMs = 0;
      let calls = 0;
      const work = searchAll(
        order.map((id) => ({
          id,
          supported: true,
          source: { bookSourceName: id, bookSourceUrl: `https://${id}.test` },
        })),
        "test",
        1,
        {
          concurrency: 3,
          timeoutMs: 2000,
          runSource: async (source) => {
            calls++;
            await new Promise((resolve) => setTimeout(resolve, source.id === "fast" ? 10 : 1000));
            return {
              sourceId: source.id,
              sourceName: source.id,
              status: "ok",
              elapsedMs: 1,
              books:
                source.id === "fast"
                  ? [{ name: "测试", author: "作者", bookUrl: "https://fast.test/book" }]
                  : [],
            };
          },
          onProgress: (update) => {
            if (update.source?.books.length && !firstResultMs) firstResultMs = Date.now() - started;
          },
        },
      );
      await vi.advanceTimersByTimeAsync(1100);
      const result = await work;
      return {
        firstResultMs,
        calls,
        results: result.results.length,
        completed: result.completedSources,
      };
    };
    const baseline = await measure(keys);
    const ranked = await measure(
      quality
        .plan(
          "comic",
          keys.map((key) => ({ key })),
        )
        .sources.map((source) => source.sourceKey),
    );
    expect(baseline).toEqual({ firstResultMs: 1010, calls: 4, results: 1, completed: 4 });
    expect(ranked).toEqual({ firstResultMs: 10, calls: 4, results: 1, completed: 4 });
  } finally {
    vi.useRealTimers();
  }
});
