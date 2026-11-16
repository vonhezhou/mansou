import { AsyncLocalStorage } from "node:async_hooks";
import type { StorageDatabase } from "@mansou/storage";

export type SourceKind = "comic" | "novel";
export type QualityOperation = "search" | "details" | "catalog" | "content" | "download";
type Category = "timeout" | "network" | "limited" | "restricted" | "parse" | "source";
type Bucket = {
  hour: number;
  success: number;
  failure: number;
  nonempty: number;
  elapsedMs: number;
  maxMs: number;
  histogram: number[];
};
type OperationRecord = {
  buckets: Bucket[];
  consecutiveFailures: number;
  failureSince?: number;
  consecutiveSuccesses: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: Category;
  cooldownUntil?: number;
  cooldownLevel: number;
};
type QualityRecord = {
  version: string;
  operations: Partial<Record<QualityOperation, OperationRecord>>;
  recentEvents: string[];
};
export type QualityEvent = {
  id?: string;
  operation: QualityOperation;
  elapsedMs: number;
  errorCode?: string;
  nonempty?: boolean;
  cancelled?: boolean;
};
const hourMs = 3_600_000;
const retentionMs = 7 * 24 * hourMs;
const latencyBounds = [250, 1000, 3000, 10000, 30000];
const emptyOperation = (): OperationRecord => ({
  buckets: [],
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  cooldownLevel: 0,
});

function category(code?: string): Category | "excluded" | undefined {
  if (!code) return undefined;
  if (
    [
      "CANCELLED",
      "SOURCE_CAPABILITY_UNSUPPORTED",
      "SOURCE_SETTINGS_INVALID",
      "SOURCE_INTERACTION_EXPIRED",
      "SOURCE_NOT_LOADED",
      "UNSUPPORTED_RULE",
      "VALIDATION_ERROR",
    ].includes(code)
  )
    return "excluded";
  if (["PLUGIN_TIMEOUT", "TIMEOUT"].includes(code)) return "timeout";
  if (["PLUGIN_NETWORK_ERROR", "NETWORK_ERROR"].includes(code)) return "network";
  if (["PLUGIN_RATE_LIMITED", "RATE_LIMITED"].includes(code)) return "limited";
  if (
    ["SOURCE_ACCESS_RESTRICTED", "SOURCE_LOGIN_FAILED", "CHALLENGE", "AUTH_REQUIRED"].includes(code)
  )
    return "restricted";
  if (["PARSE_MISMATCH", "PLUGIN_API_MISSING"].includes(code)) return "parse";
  return "source";
}

/** 仅接收分类结果和计数；参数、作品与错误原文不会进入持久化统计。 */
export class SourceQualityService {
  private readonly scope = new AsyncLocalStorage<AbortSignal>();
  private networkFailures: Array<{ identity: string; time: number }> = [];

  constructor(
    private readonly db: StorageDatabase["sourceQuality"],
    private readonly now = Date.now,
  ) {}

  withSignal<T>(signal: AbortSignal | undefined, work: () => T): T {
    return signal ? this.scope.run(signal, work) : work();
  }
  currentSignal() {
    return this.scope.getStore();
  }

  register(kind: SourceKind, key: string, version: string) {
    if (this.db.get<QualityRecord>(kind, key)?.version === version) return;
    this.db.update<QualityRecord>(kind, key, (current) =>
      current?.version === version ? current : { version, operations: {}, recentEvents: [] },
    );
  }

  delete(kind: SourceKind, key: string) {
    this.db.delete(kind, key);
  }

  version(kind: SourceKind, key: string) {
    return this.db.get<QualityRecord>(kind, key)?.version;
  }

  record(kind: SourceKind, key: string, version: string, event: QualityEvent) {
    const error = category(event.errorCode);
    if (event.cancelled || this.scope.getStore()?.aborted || error === "excluded") return;
    const now = this.now();
    if (error === "network" || error === "timeout") {
      this.networkFailures = this.networkFailures.filter((item) => item.time > now - 30_000);
      this.networkFailures.push({ identity: `${kind}:${key}`, time: now });
      this.networkFailures = this.networkFailures.slice(-100);
      if (new Set(this.networkFailures.map((item) => item.identity)).size >= 3) return;
    }
    const current = this.db.get<QualityRecord>(kind, key);
    // 删除、更新源之后迟到的旧调用不能重建记录或污染新规则。
    if (!current || current.version !== version) return;
    this.db.update<QualityRecord>(kind, key, (record) => {
      if (!record || record.version !== version) return record;
      const value = record;
      const id = event.id;
      if (id && value.recentEvents.includes(id)) return value;
      if (id) value.recentEvents = [...value.recentEvents, id].slice(-128);
      const operation = value.operations[event.operation] ?? emptyOperation();
      operation.buckets = operation.buckets.filter((bucket) => bucket.hour > now - retentionMs);
      const hour = Math.floor(now / hourMs) * hourMs;
      let bucket = operation.buckets.find((item) => item.hour === hour);
      if (!bucket) {
        bucket = {
          hour,
          success: 0,
          failure: 0,
          nonempty: 0,
          elapsedMs: 0,
          maxMs: 0,
          histogram: [0, 0, 0, 0, 0, 0],
        };
        operation.buckets.push(bucket);
      }
      if (error) {
        bucket.failure++;
        if (!operation.consecutiveFailures || (operation.lastFailureAt ?? 0) < now - retentionMs) {
          operation.consecutiveFailures = 0;
          if ((operation.lastFailureAt ?? 0) < now - retentionMs) operation.cooldownLevel = 0;
          operation.failureSince = now;
        }
        operation.consecutiveFailures++;
        operation.consecutiveSuccesses = 0;
        operation.lastFailureAt = now;
        operation.lastError = error;
        const sustained =
          operation.consecutiveFailures >= 5 && now - operation.failureSince! >= 120_000;
        if (error === "limited" || sustained) {
          if ((operation.cooldownUntil ?? 0) <= now)
            operation.cooldownLevel = Math.min(7, operation.cooldownLevel + 1);
          operation.cooldownUntil =
            now + Math.min(3_600_000, 60_000 * 2 ** (operation.cooldownLevel - 1));
        }
      } else {
        bucket.success++;
        if (event.nonempty) bucket.nonempty++;
        const elapsed = Number.isFinite(event.elapsedMs) ? Math.max(0, event.elapsedMs) : 0;
        bucket.maxMs = Math.max(bucket.maxMs, elapsed);
        bucket.elapsedMs += elapsed;
        const index = latencyBounds.findIndex((bound) => elapsed <= bound);
        bucket.histogram[index < 0 ? latencyBounds.length : index]++;
        operation.lastSuccessAt = now;
        operation.consecutiveFailures = 0;
        operation.failureSince = undefined;
        operation.consecutiveSuccesses++;
        operation.cooldownUntil = undefined;
        if (operation.consecutiveSuccesses >= 2) operation.cooldownLevel = 0;
      }
      value.operations[event.operation] = operation;
      return value;
    });
  }

  snapshot(kind: SourceKind, key: string, version?: string) {
    const record = this.db.get<QualityRecord>(kind, key);
    const now = this.now();
    const operations = Object.entries(
      record?.version === (version ?? record?.version) ? (record?.operations ?? {}) : {},
    ).map(([name, item]) => {
      const buckets = item.buckets.filter((bucket) => bucket.hour > now - retentionMs);
      let successes = 0,
        failures = 0,
        nonempty = 0,
        elapsed = 0;
      const histogram = [0, 0, 0, 0, 0, 0];
      for (const bucket of buckets) {
        const weight = 2 ** (-(now - bucket.hour) / (24 * hourMs));
        successes += bucket.success * weight;
        failures += bucket.failure * weight;
        nonempty += bucket.nonempty * weight;
        elapsed += bucket.elapsedMs * weight;
        bucket.histogram.forEach((count, index) => (histogram[index] += count));
      }
      const samples = successes + failures;
      const reliability = (100 * (successes + 2)) / (samples + 4);
      const meanMs = successes ? elapsed / successes : 0;
      const speed = successes ? 100 / (1 + meanMs / 3000) : 50;
      // 空结果可用，但只有有效命中才能获得完整速度加分。
      const hitFactor = name === "search" ? (nonempty + 1) / (successes + 2) : 1;
      const score = Math.round(0.7 * reliability + 0.3 * speed * hitFactor);
      const recentFailure = (item.lastFailureAt ?? 0) > now - retentionMs;
      const consecutiveFailures = recentFailure ? item.consecutiveFailures : 0;
      const cooldownUntil =
        (item.cooldownUntil ?? 0) > now ? new Date(item.cooldownUntil!).toISOString() : undefined;
      let state: "observing" | "normal" | "preferred" | "degraded" | "isolated" = "normal";
      if (cooldownUntil) state = "isolated";
      else if (
        consecutiveFailures >= 3 ||
        (item.cooldownLevel > 0 && item.consecutiveSuccesses < 2 && recentFailure)
      )
        state = "degraded";
      else if (samples < 5) state = "observing";
      else if (score >= 75 && consecutiveFailures === 0) state = "preferred";
      const totalSuccess = buckets.reduce((sum, bucket) => sum + bucket.success, 0);
      const percentile = (p: number) => {
        let count = 0;
        const threshold = Math.ceil(totalSuccess * p);
        if (!threshold) return 0;
        const index = histogram.findIndex((value) => {
          count += value;
          return count >= threshold;
        });
        return (
          latencyBounds[index] ?? Math.ceil(Math.max(...buckets.map((bucket) => bucket.maxMs)))
        );
      };
      return {
        operation: name as QualityOperation,
        score,
        state,
        successCount: totalSuccess,
        failureCount: buckets.reduce((sum, bucket) => sum + bucket.failure, 0),
        nonemptyCount: buckets.reduce((sum, bucket) => sum + bucket.nonempty, 0),
        consecutiveFailures,
        meanMs: Math.round(meanMs),
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        lastSuccessAt: item.lastSuccessAt ? new Date(item.lastSuccessAt).toISOString() : undefined,
        lastFailureAt: item.lastFailureAt ? new Date(item.lastFailureAt).toISOString() : undefined,
        lastError: item.lastError,
        cooldownUntil,
      };
    });
    const search = operations.find((item) => item.operation === "search");
    const penalty = operations.some(
      (item) => item.operation === "download" && item.consecutiveFailures >= 3,
    )
      ? 15
      : 0;
    return {
      score: Math.max(0, (search?.score ?? 50) - penalty),
      state: search?.state ?? ("observing" as const),
      cooldownUntil: search?.cooldownUntil,
      checkedAt: new Date(now).toISOString(),
      operations,
    };
  }

  plan(
    kind: SourceKind,
    candidates: Array<{ key: string; version?: string }>,
    includeIsolated = false,
    preferences: Record<string, number> = {},
  ) {
    const scored = candidates.map((item) => ({
      ...item,
      quality: this.snapshot(kind, item.key, item.version),
    }));
    const skipped = scored.filter((item) => !includeIsolated && item.quality.state === "isolated");
    const queued = scored
      .filter((item) => includeIsolated || item.quality.state !== "isolated")
      .sort(
        (a, b) =>
          b.quality.score +
          Math.min(10, preferences[b.key] ?? 0) -
          a.quality.score -
          Math.min(10, preferences[a.key] ?? 0),
      );
    // 每轮用不同的观察源占一个靠前槽位，长期全量搜索仍会执行其余候选。
    const exploring = queued.filter(
      (item) => item.quality.state === "observing" || item.quality.state === "degraded",
    );
    if (exploring.length) {
      const probe = exploring[Math.floor(this.now() / 60_000) % exploring.length];
      const index = queued.indexOf(probe);
      if (index > 2) {
        queued.splice(index, 1);
        queued.splice(2, 0, probe);
      }
    }
    return {
      sources: queued.map((item) => ({ sourceKey: item.key, quality: item.quality })),
      skipped: skipped.map((item) => ({
        sourceKey: item.key,
        cooldownUntil: item.quality.cooldownUntil!,
      })),
    };
  }
}
