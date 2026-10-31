import type { components } from "@mansou/contracts";
import { apiResponse } from "./client.js";

type Search = components["schemas"]["NovelSearch"];
type SearchEvent = components["schemas"]["NovelSearchEvent"];

export async function searchNovels(
  keyword: string,
  page: number,
  onUpdate: (result: Search) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiResponse("/novels/search", {
    method: "POST",
    body: JSON.stringify({ keyword, page }),
    signal,
  });
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson"))
    throw new Error("搜索响应格式错误，请重试");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result: Search | undefined;
  let complete = false;
  const groups = new Map<string, Search["results"][number]>();
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const receive = (line: string) => {
    signal?.throwIfAborted();
    if (!line.trim()) return;
    if (complete) throw new Error("搜索完成后收到额外数据");
    const event = JSON.parse(line) as SearchEvent;
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "start") {
      if (result) throw new Error("收到重复的搜索开始事件");
      result = {
        ...event,
        elapsedMs: 0,
        cancelled: false,
        completedSources: 0,
        results: [],
        sources: [],
      };
    } else {
      if (!result) throw new Error("搜索响应缺少开始事件");
      if (event.type === "source") {
        const source = event.source;
        if (result.sources.some((row) => row.sourceId === source.sourceId))
          throw new Error("收到重复的书源结果");
        for (const book of source.books) {
          // 与引擎保持一致：作者缺失时不跨源合并，仅规范化后的同名同作者聚合。
          const key = book.author
            ? JSON.stringify([normalize(book.name), normalize(book.author)])
            : JSON.stringify([source.sourceId, book.bookUrl]);
          const group = groups.get(key) ?? { name: book.name, author: book.author, origins: [] };
          if (
            !group.origins.some(
              (origin) => origin.sourceId === source.sourceId && origin.bookUrl === book.bookUrl,
            )
          )
            groups.set(key, {
              ...group,
              origins: [
                ...group.origins,
                { ...book, sourceId: source.sourceId, sourceName: source.sourceName },
              ],
            });
        }
        result = {
          ...result,
          elapsedMs: event.elapsedMs,
          completedSources: result.completedSources + 1,
          sources: [...result.sources, source],
          results: [...groups.values()],
        };
      } else if (event.type === "complete") {
        if (!event.cancelled && result.completedSources !== result.totalSources)
          throw new Error("搜索提前结束，已返回结果仍可查看，请重试");
        complete = true;
        result = { ...result, elapsedMs: event.elapsedMs, cancelled: event.cancelled };
      } else throw new Error("未知的搜索事件");
    }
    onUpdate(result);
  };
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        receive(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (done) break;
    }
    if (pending.trim()) receive(pending);
    if (!complete) throw new Error("搜索连接中断，已返回结果仍可查看，请重试");
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
