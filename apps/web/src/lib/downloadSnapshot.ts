import type { DownloadTask } from "../types.js";

export type DownloadSnapshotStore<T extends { status: string } = DownloadTask> = {
  getSnapshot: () => T[];
  getActiveCount: () => number;
  subscribe: (listener: () => void) => () => void;
  setSnapshot: (tasks: T[]) => void;
};

export function createDownloadSnapshotStore<
  T extends { status: string } = DownloadTask,
>(): DownloadSnapshotStore<T> {
  let snapshot: T[] = [];
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
    setSnapshot(tasks: T[]) {
      snapshot = tasks;
      activeCount = tasks.reduce(
        (count, task) => count + (task.status === "queued" || task.status === "running" ? 1 : 0),
        0,
      );
      listeners.forEach((listener) => listener());
    },
  };
}
