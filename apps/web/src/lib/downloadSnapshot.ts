import type { DownloadTask } from "../types.js";

export type DownloadSnapshotStore = ReturnType<typeof createDownloadSnapshotStore>;

export function createDownloadSnapshotStore() {
  let snapshot: DownloadTask[] = [];
  let activeCount = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    getActiveCount: () => activeCount,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSnapshot(tasks: DownloadTask[]) {
      snapshot = tasks;
      activeCount = tasks.reduce(
        (count, task) => count + (task.status === "queued" || task.status === "running" ? 1 : 0),
        0,
      );
      listeners.forEach((listener) => listener());
    },
  };
}
