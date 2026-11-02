import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { novelApi, type NovelTask } from "../api/novels.js";
import { useNovelDownloads } from "./useNovelDownloads.js";

it("空闲时每 30 秒检查，任务运行时每 2 秒刷新，后台暂停且相同快照不通知视图", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const tasks = vi.spyOn(novelApi, "tasks").mockResolvedValue([]);
  let value!: ReturnType<typeof useNovelDownloads>;
  function Harness() {
    value = useNovelDownloads();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    const notify = vi.fn();
    const unsubscribe = value.store.subscribe(notify);
    await act(async () => vi.advanceTimersByTimeAsync(29999));
    expect(tasks).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(tasks).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();

    tasks.mockResolvedValue([task("active")]);
    await act(async () => value.reload());
    expect(notify).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(tasks).toHaveBeenCalledTimes(4);
    expect(notify).toHaveBeenCalledTimes(1);

    hidden = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(tasks).toHaveBeenCalledTimes(4);
    hidden = false;
    tasks.mockResolvedValue([{ ...task("active"), status: "completed" }]);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(tasks).toHaveBeenCalledTimes(5);
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(tasks).toHaveBeenCalledTimes(6);
    unsubscribe();
  } finally {
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

const task = (id: string): NovelTask => ({
  id,
  sourceId: "source",
  sourceName: "源",
  name: "小说",
  author: "作者",
  bookUrl: "https://test.invalid/book",
  status: "running",
  phase: "下载中",
  total: 2,
  completed: 1,
  all: false,
  start: 1,
  limit: 2,
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
});

it("轮询不重叠；手动刷新中止旧请求，迟到响应及卸载不能回滚任务快照", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const pending: Array<{ signal?: AbortSignal; resolve: (tasks: NovelTask[]) => void }> = [];
  vi.spyOn(novelApi, "tasks").mockImplementation(
    (signal) => new Promise((resolve) => pending.push({ signal, resolve })),
  );
  let value!: ReturnType<typeof useNovelDownloads>;
  function Harness() {
    value = useNovelDownloads();
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let unmounted = false;
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTime(6000));
    expect(pending).toHaveLength(1);
    let refreshed!: Promise<void>;
    await act(async () => {
      refreshed = value.reload();
    });
    expect(pending).toHaveLength(2);
    expect(pending[0].signal?.aborted).toBe(true);
    await act(async () => {
      pending[1].resolve([task("new")]);
      await refreshed;
    });
    await act(async () => pending[0].resolve([task("old")]));
    expect(value.store.getSnapshot()[0].id).toBe("new");
    await act(async () => {
      refreshed = value.reload();
    });
    await act(async () => root.unmount());
    unmounted = true;
    expect(pending[2].signal?.aborted).toBe(true);
    await act(async () => {
      pending[2].resolve([task("late")]);
      await refreshed;
    });
    expect(value.store.getSnapshot()[0].id).toBe("new");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
