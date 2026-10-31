import { describe, expect, it } from "vitest";
import { SourceHealthTracker } from "../src/health.js";
import { classifyPluginError, type PluginErrorCode } from "../src/errors.js";

function tracker() {
  let now = Date.parse("2026-10-31T00:00:00Z");
  return {
    health: new SourceHealthTracker(() => now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("近期源可用性推测", () => {
  it("没有数据和过期数据不推断可用；图片、设置及未实现能力不计入", () => {
    const { health, advance } = tracker();
    health.record("loadImageBytes", "PLUGIN_SOURCE_ERROR");
    health.record("settings");
    health.record("login", "SOURCE_LOGIN_FAILED");
    health.record("comicDetails", "SOURCE_CAPABILITY_UNSUPPORTED");
    expect(health.snapshot()).toMatchObject({ status: "unknown", operations: [] });
    health.record("search");
    expect(health.snapshot().status).toBe("available");
    advance(24 * 60 * 60 * 1000);
    expect(health.snapshot()).toMatchObject({ status: "unknown", operations: [] });
  });

  it("至少三次执行错误且跨两分钟才推断疑似失效；同功能成功可恢复", () => {
    const { health, advance } = tracker();
    health.record("search", "PLUGIN_SOURCE_ERROR");
    advance(120_000);
    health.record("search", "PLUGIN_SOURCE_ERROR");
    expect(health.snapshot().status).toBe("unstable");
    health.record("search", "PLUGIN_API_MISSING");
    expect(health.snapshot()).toMatchObject({
      status: "suspected_broken",
      operations: [{ consecutiveFailures: 3, failureCount: 3, successCount: 0 }],
    });
    health.record("search");
    expect(health.snapshot()).toMatchObject({
      status: "available",
      operations: [
        {
          consecutiveFailures: 0,
          failureCount: 3,
          successCount: 1,
          lastSuccessAt: expect.any(String),
        },
      ],
    });
  });

  it("短时间大量重试不能推断损坏，每项功能仅保留五十条样本", () => {
    const { health } = tracker();
    for (let i = 0; i < 1000; i++) health.record("search", "PLUGIN_SOURCE_ERROR");
    expect(health.snapshot()).toMatchObject({
      status: "unstable",
      operations: [{ failureCount: 50 }],
    });
  });

  it.each<PluginErrorCode>([
    "PLUGIN_TIMEOUT",
    "PLUGIN_NETWORK_ERROR",
    "IMAGE_REJECTED",
    "PLUGIN_RATE_LIMITED",
  ])("%s 持续失败也不能推断损坏", (code) => {
    const { health, advance } = tracker();
    for (let i = 0; i < 4; i++) {
      health.record("search", code);
      advance(120_000);
    }
    expect(health.snapshot().status).toBe("unstable");
  });

  it.each<PluginErrorCode>(["SOURCE_ACCESS_RESTRICTED", "SOURCE_LOGIN_FAILED"])(
    "%s 单独标记访问受限，成功后恢复",
    (code) => {
      const { health } = tracker();
      health.record("search", code);
      expect(health.snapshot().status).toBe("restricted");
      health.record("search");
      expect(health.snapshot().status).toBe("available");
    },
  );

  it("搜索成功不会掩盖详情持续失败，功能恢复后清除疑似失效", () => {
    const { health, advance } = tracker();
    for (let i = 0; i < 3; i++) {
      health.record("comicDetails", "PLUGIN_SOURCE_ERROR");
      advance(60_000);
    }
    health.record("search");
    expect(health.snapshot()).toMatchObject({
      status: "suspected_broken",
      operations: [
        { operation: "search", status: "available" },
        { operation: "comicDetails", status: "suspected_broken" },
      ],
    });
    health.record("comicDetails");
    expect(health.snapshot().status).toBe("available");
  });

  it("识别限流错误以免归为源执行损坏", () => {
    for (const message of ["HTTP 429", "Too many requests", "rate limit exceeded"]) {
      expect(classifyPluginError(new Error(message)).code).toBe("PLUGIN_RATE_LIMITED");
    }
  });
});
