import { useCallback, useEffect, useRef, useState } from "react";
import { novelApi, type NovelCatalog, type NovelOrigin, type NovelSource } from "../api/novels.js";

const cacheLifetimeMs = 60_000;
const cacheChapterBudget = 10_000;
const cacheEntryLimit = 3;

export function useNovelCatalog() {
  const [origin, setOrigin] = useState<NovelOrigin>();
  const [catalog, setCatalog] = useState<NovelCatalog>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, { value: NovelCatalog; expires: number }>());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
      cache.current.clear();
    };
  }, []);

  const close = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setOrigin(undefined);
    setCatalog(undefined);
    setLoading(false);
    setError(undefined);
  }, []);

  const load = useCallback(async (value: NovelOrigin, source?: NovelSource, refresh = false) => {
    if (!active.current) return;
    request.current?.abort();
    request.current = null;
    setOrigin({ ...value });
    setCatalog(undefined);
    setError(undefined);
    setLoading(false);
    if (!source?.enabled) {
      setError("书源不可用或已停用，请启用后重试");
      return;
    }
    if (!source.downloadSupported) {
      setError(source?.downloadError ?? "该书源暂不支持目录与下载");
      return;
    }
    // 规则摘要参与身份，避免源更新后复用旧目录；缓存同时受时间、条目数和总章节数约束。
    const key = JSON.stringify([source.id, source.hash, value.bookUrl]);
    for (const [key, entry] of cache.current)
      if (entry.expires <= Date.now()) cache.current.delete(key);
    const hit = cache.current.get(key);
    if (hit && !refresh) {
      cache.current.delete(key);
      cache.current.set(key, hit);
      setCatalog(hit.value);
      return;
    }
    cache.current.delete(key);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await novelApi.catalog(value, controller.signal);
      if (!active.current || controller.signal.aborted || request.current !== controller) return;
      setCatalog(result);
      if (result.tocComplete && result.chapters.length <= cacheChapterBudget) {
        cache.current.set(key, { value: result, expires: Date.now() + cacheLifetimeMs });
        const retainedChapters = () =>
          [...cache.current.values()].reduce((sum, entry) => sum + entry.value.chapters.length, 0);
        while (cache.current.size > cacheEntryLimit || retainedChapters() > cacheChapterBudget) {
          cache.current.delete(cache.current.keys().next().value!);
        }
      }
    } catch (error) {
      if (active.current && !controller.signal.aborted && request.current === controller)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (active.current && request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, []);
  return { origin, catalog, loading, error, load, close };
}
