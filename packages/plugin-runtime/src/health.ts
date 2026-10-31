import type { Operation } from "./executors/protocol.js";
import type { PluginErrorCode } from "./errors.js";

const windowMs = 24 * 60 * 60 * 1000;
const sampleLimit = 50;
const failureSpanMs = 2 * 60 * 1000;
const trackedOperations = ["search", "comicDetails", "comicPages"] as const;
type HealthOperation = (typeof trackedOperations)[number];
type HealthStatus = "unknown" | "available" | "unstable" | "suspected_broken" | "restricted";
type Sample = { time: number; code?: PluginErrorCode };

export type SourceOperationHealth = {
  operation: HealthOperation;
  status: HealthStatus;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastErrorCode?: PluginErrorCode;
};
export type SourceHealth = {
  status: HealthStatus;
  observedSince: string;
  checkedAt: string;
  operations: SourceOperationHealth[];
};

export class SourceHealthTracker {
  private readonly samples = new Map<HealthOperation, Sample[]>();
  private readonly observedSince: string;

  constructor(private readonly now: () => number = Date.now) {
    this.observedSince = new Date(now()).toISOString();
  }

  record(operation: Operation, code?: PluginErrorCode) {
    if (!trackedOperations.includes(operation as HealthOperation)) return;
    // 配置、生命周期与未实现能力不代表内容源执行失败；不记录参数、错误原文或凭据。
    if (
      code &&
      [
        "SOURCE_CAPABILITY_UNSUPPORTED",
        "SOURCE_SETTINGS_INVALID",
        "SOURCE_INTERACTION_EXPIRED",
        "SOURCE_NOT_LOADED",
      ].includes(code)
    )
      return;
    const key = operation as HealthOperation;
    const time = this.now();
    const samples = (this.samples.get(key) ?? []).filter((sample) => sample.time > time - windowMs);
    samples.push({ time, code });
    this.samples.set(key, samples.slice(-sampleLimit));
  }

  snapshot(): SourceHealth {
    const now = this.now();
    const operations = trackedOperations.flatMap((operation): SourceOperationHealth[] => {
      const samples = (this.samples.get(operation) ?? []).filter(
        (sample) => sample.time > now - windowMs,
      );
      this.samples.set(operation, samples);
      if (!samples.length) return [];
      const successes = samples.filter((sample) => !sample.code);
      const failures = samples.filter((sample) => sample.code);
      const last = samples[samples.length - 1];
      const lastSuccess = successes.at(-1);
      const lastFailure = failures.at(-1);
      const streak = samples.slice(lastSuccess ? samples.lastIndexOf(lastSuccess) + 1 : 0);
      const restricted =
        last.code === "SOURCE_ACCESS_RESTRICTED" || last.code === "SOURCE_LOGIN_FAILED";
      // 快速重复请求、网络故障与内容拒绝不能直接推断插件损坏。
      const sustained =
        streak.length >= 3 &&
        last.time - streak[0].time >= failureSpanMs &&
        streak.every(
          (sample) => sample.code === "PLUGIN_SOURCE_ERROR" || sample.code === "PLUGIN_API_MISSING",
        );
      return [
        {
          operation,
          status: !last.code
            ? "available"
            : restricted
              ? "restricted"
              : sustained
                ? "suspected_broken"
                : "unstable",
          successCount: successes.length,
          failureCount: failures.length,
          consecutiveFailures: streak.length,
          lastSuccessAt: lastSuccess ? new Date(lastSuccess.time).toISOString() : undefined,
          lastFailureAt: lastFailure ? new Date(lastFailure.time).toISOString() : undefined,
          lastErrorCode: lastFailure?.code,
        },
      ];
    });
    const status =
      (["restricted", "suspected_broken", "unstable", "available"] as const).find((status) =>
        operations.some((operation) => operation.status === status),
      ) ?? "unknown";
    return {
      status,
      observedSince: this.observedSince,
      checkedAt: new Date(now).toISOString(),
      operations,
    };
  }
}
