import { useCallback, useEffect, useRef, useState } from "react";
import { novelApi, type NovelTask } from "../api/novels.js";
import { createDownloadSnapshotStore } from "../lib/downloadSnapshot.js";

export function useNovelDownloads() {
  const [store] = useState(() => createDownloadSnapshotStore<NovelTask>());
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const reload = useCallback(async () => {
    if (!active.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const tasks = await novelApi.tasks(controller.signal);
      if (!controller.signal.aborted) {
        store.setSnapshot(tasks);
        setError(undefined);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
        throw error;
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [store]);
  useEffect(() => {
    active.current = true;
    const poll = () => {
      if (!document.hidden && !request.current) void reload().catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 2000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      request.current?.abort();
    };
  }, [reload]);
  return { store, error, reload };
}
