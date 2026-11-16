import type { SourceRegistry } from "@mansou/core";
import type { SourceQualityService } from "./sourceQuality.js";

export class SearchService {
  constructor(
    private readonly sources: SourceRegistry,
    private readonly quality?: SourceQualityService,
  ) {}

  search(
    sourceKey: string,
    keyword: string,
    pageOrNext?: string,
    options?: string[],
    signal?: AbortSignal,
  ) {
    const work = () =>
      this.sources
        .get(sourceKey)
        .search({ keyword, page: Number(pageOrNext ?? 1), cursor: pageOrNext, options });
    return this.quality ? this.quality.withSignal(signal, work) : work();
  }

  plan(sourceKeys?: string[], includeIsolated = false, preferences: Record<string, number> = {}) {
    const selected =
      sourceKeys ??
      this.sources
        .list()
        .filter((source) => source.capabilities.search)
        .map((source) => source.key);
    const candidates = [...new Set(selected)].map((key) => ({ key }));
    const plan = this.quality?.plan("comic", candidates, includeIsolated, preferences) ?? {
      sources: candidates.map((source) => ({ sourceKey: source.key })),
      skipped: [],
    };
    const all = new Map(this.sources.list().map((source) => [source.key, source]));
    return {
      ...plan,
      sources: plan.sources.map((source) => {
        let groupKey = source.sourceKey;
        try {
          groupKey = new URL(all.get(source.sourceKey)?.url ?? "").hostname;
        } catch {
          /* 未提供站点地址的源按自身身份调度。 */
        }
        return { ...source, groupKey };
      }),
    };
  }

  async aggregatedSearch(keyword: string, sourceKeys?: string[], signal?: AbortSignal) {
    const all = this.sources.list();
    const requested = sourceKeys?.length ? sourceKeys : undefined;
    const plan = this.plan(requested);
    const selected = plan.sources.map((source) => source.sourceKey);
    type Item = {
      sourceKey: string;
      sourceName: string;
      result?: Awaited<ReturnType<SearchService["search"]>>;
      error?: string;
      skipped?: boolean;
      cooldownUntil?: string;
    };
    const results: Item[] = plan.skipped.map((source) => ({
      ...source,
      skipped: true,
      sourceName: all.find((item) => item.key === source.sourceKey)?.name ?? source.sourceKey,
    }));
    const groups = new Map<string, string[]>();
    for (const source of plan.sources) {
      const group = groups.get(source.groupKey) ?? [];
      group.push(source.sourceKey);
      groups.set(source.groupKey, group);
    }
    const pending = [...groups.values()];
    const worker = async () => {
      while (pending.length && !signal?.aborted) {
        const group = pending.shift()!;
        const sourceKey = group.shift()!;
        const sourceName = all.find((source) => source.key === sourceKey)?.name ?? sourceKey;
        try {
          results.push({
            sourceKey,
            sourceName,
            result: await this.search(sourceKey, keyword, undefined, undefined, signal),
          });
        } catch (error) {
          if (!signal?.aborted)
            results.push({
              sourceKey,
              sourceName,
              error: error instanceof Error ? error.message : String(error),
            });
        }
        if (group.length) pending.push(group);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, selected.length) }, worker));
    const order = new Map([...new Set(requested ?? selected)].map((key, index) => [key, index]));
    return results.sort((a, b) => (order.get(a.sourceKey) ?? 0) - (order.get(b.sourceKey) ?? 0));
  }
}
