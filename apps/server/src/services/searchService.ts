import type { SourceRegistry } from "@venera/core";
export class SearchService {
  constructor(private readonly sources: SourceRegistry) {}
  search(sourceKey: string, keyword: string, pageOrNext?: string, options?: string[]) {
    return this.sources
      .get(sourceKey)
      .search({ keyword, page: Number(pageOrNext ?? 1), cursor: pageOrNext, options });
  }
  async aggregatedSearch(keyword: string, sourceKeys?: string[]) {
    const all = this.sources.list();
    const selected = sourceKeys?.length
      ? sourceKeys
      : all.filter((source) => source.capabilities.search).map((source) => source.key);
    return Promise.all(
      [...new Set(selected)].map(async (sourceKey) => {
        const sourceName = all.find((source) => source.key === sourceKey)?.name ?? sourceKey;
        try {
          return { sourceKey, sourceName, result: await this.search(sourceKey, keyword) };
        } catch (error) {
          return {
            sourceKey,
            sourceName,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }
}
