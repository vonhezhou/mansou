import { useCallback, useEffect, useRef, useState } from "react";
import { novelApi, type NovelTask } from "../api/novels.js";
import { createDownloadSnapshotStore } from "../lib/downloadSnapshot.js";

export function useNovelDownloads() {
  const [store] = useState(() => createDownloadSnapshotStore<NovelTask>());
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSnapshot = useRef<string | undefined>(undefined);
  const reload = useCallback(async () => {
    if (!active.current) return;
    clearTimeout(timer.current);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const tasks = await novelApi.tasks(controller.signal);
      if (!controller.signal.aborted) {
        const snapshot = JSON.stringify(tasks);
        if (snapshot !== lastSnapshot.current) {
          store.setSnapshot(tasks);
          lastSnapshot.current = snapshot;
        }
        setError(undefined);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
        throw error;
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        // 按请求完成时间调度，空闲时降低频率；本地任务操作仍会立即刷新。
        if (active.current && !document.hidden)
          timer.current = setTimeout(
            () => void reload().catch(() => {}),
            store.getActiveCount() ? 2000 : 30000,
          );
      }
    }
  }, [store]);
  useEffect(() => {
    active.current = true;
    const poll = () => {
      clearTimeout(timer.current);
      if (!document.hidden && !request.current) void reload().catch(() => {});
    };
    poll();
    document.addEventListener("visibilitychange", poll);
    return () => {
      active.current = false;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", poll);
      request.current?.abort();
      request.current = null;
    };
  }, [reload]);
  return { store, error, reload };
}
