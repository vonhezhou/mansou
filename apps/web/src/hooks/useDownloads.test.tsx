import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDownloads } from "./useDownloads.js";
import { veneraApi } from "../api/venera.js";
import type { DownloadTask } from "../types.js";

let state: ReturnType<typeof useDownloads>;
let root: Root;
let container: HTMLDivElement;
const errors = vi.fn();
const task = (id: string, status = "paused") => ({ id, status }) as DownloadTask;
function Harness() {
  state = useDownloads(async (setLoading, work) => {
    setLoading(true);
    try {
      await work();
    } catch (error) {
      errors(error);
    } finally {
      setLoading(false);
    }
  });
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(veneraApi, "listDownloads").mockResolvedValue([]);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("prevents duplicate commands for one task while allowing another task to proceed", async () => {
  let finish!: (value: DownloadTask) => void;
  vi.spyOn(veneraApi, "pauseDownload").mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const resume = vi.spyOn(veneraApi, "resumeDownload").mockResolvedValue(task("b", "running"));
  let pending: Promise<void>;
  await act(async () => {
    pending = state.downloadAction(task("a", "running"), "pause");
  });
  await act(async () => state.downloadAction(task("a", "running"), "pause"));
  expect(veneraApi.pauseDownload).toHaveBeenCalledTimes(1);
  await act(async () => state.downloadAction(task("b"), "resume"));
  expect(resume).toHaveBeenCalledWith("b");
  expect(state.taskOperations).toEqual({ a: "正在暂停任务…" });
  await act(async () => {
    finish(task("a"));
    await pending;
  });
  expect(state.taskOperations).toEqual({});
});

it("keeps detail errors visible and reloads them successfully", async () => {
  const load = vi
    .spyOn(veneraApi, "listDownloadItemsPage")
    .mockRejectedValueOnce(new Error("连接失败"))
    .mockResolvedValueOnce({
      items: [{ imageKey: "one", status: "failed" }],
      total: 1,
      failedTotal: 1,
      offset: 0,
      limit: 100,
    });
  await act(async () => state.loadDownloadItems(task("a")));
  expect(state.itemErrors.a).toBe("连接失败");
  expect(state.taskOperations).toEqual({});
  await act(async () => state.loadDownloadItems(task("a")));
  expect(load).toHaveBeenCalledTimes(2);
  expect(state.itemErrors.a).toBeUndefined();
  expect(state.downloadItems.a.items[0].imageKey).toBe("one");
});

it("keeps operation errors with their tasks and clears only the retried task's error", async () => {
  let finish!: (value: DownloadTask) => void;
  const pause = vi
    .spyOn(veneraApi, "pauseDownload")
    .mockRejectedValueOnce(new Error("暂停失败"))
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
  vi.spyOn(veneraApi, "resumeDownload").mockRejectedValueOnce(new Error("继续失败"));
  await act(async () => state.downloadAction(task("a", "running"), "pause"));
  await act(async () => state.downloadAction(task("b"), "resume"));
  expect(state.taskErrors).toEqual({ a: "暂停失败", b: "继续失败" });
  expect(state.taskOperations).toEqual({});
  expect(errors).not.toHaveBeenCalled();
  let pending: Promise<void>;
  await act(async () => {
    pending = state.downloadAction(task("a", "running"), "pause");
  });
  expect(state.taskErrors).toEqual({ b: "继续失败" });
  expect(state.taskOperations.a).toBe("正在暂停任务…");
  await act(async () => {
    finish(task("a"));
    await pending;
  });
  expect(pause).toHaveBeenCalledTimes(2);
  expect(state.taskErrors).toEqual({ b: "继续失败" });
  expect(state.taskOperations).toEqual({});
});

it("blocks image retries during active downloads and uses batch retry for a stopped task", async () => {
  const retry = vi.spyOn(veneraApi, "retryDownloadItem");
  const batch = vi.spyOn(veneraApi, "retryFailedDownloadItems").mockResolvedValue({
    task: task("a"),
    retried: 1,
    results: [
      {
        imageKey: "one",
        ok: true,
        item: {
          id: "a:one",
          task_id: "a",
          image_key: "one",
          status: "completed",
          retry_count: 1,
          updated_at: "now",
        },
      },
    ],
  });
  vi.spyOn(veneraApi, "listDownloadItemsPage").mockResolvedValue({
    items: [],
    total: 0,
    failedTotal: 0,
    offset: 0,
    limit: 100,
  });
  await act(async () =>
    state.retryDownloadItem(task("a", "running"), { imageKey: "one", status: "failed" }),
  );
  expect(retry).not.toHaveBeenCalled();
  await act(async () => state.downloadAction(task("a"), "retry-failed"));
  expect(batch).toHaveBeenCalledWith("a");
  expect(veneraApi.listDownloadItemsPage).toHaveBeenCalledWith("a", {
    offset: 0,
    limit: 100,
    failedOnly: false,
  });
});

it("does not overwrite a newer live snapshot with an older list response", async () => {
  let finish!: (tasks: DownloadTask[]) => void;
  vi.mocked(veneraApi.listDownloads).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let pending: Promise<void>;
  await act(async () => {
    pending = state.loadDownloads();
  });
  await act(async () => state.setDownloads([task("a", "completed")]));
  await act(async () => {
    finish([task("a", "running")]);
    await pending;
  });
  expect(state.snapshotStore.getSnapshot()[0].status).toBe("completed");
});

it("requests the current filter from the server and ignores the old filter's response", async () => {
  let finish!: (value: Awaited<ReturnType<typeof veneraApi.listDownloadItemsPage>>) => void;
  const load = vi.spyOn(veneraApi, "listDownloadItemsPage").mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.loadDownloadItems(task("a"));
  });
  await act(async () => state.setFailedItemsOnly(true));
  await act(async () => {
    finish({
      items: [{ imageKey: "old", status: "completed" }],
      total: 1,
      failedTotal: 0,
      offset: 0,
      limit: 100,
    });
    await pending;
  });
  expect(state.downloadItems.a).toBeUndefined();
  load.mockResolvedValueOnce({
    items: [{ imageKey: "failed", status: "failed" }],
    total: 1,
    failedTotal: 1,
    offset: 0,
    limit: 100,
  });
  await act(async () => state.loadDownloadItems(task("a")));
  expect(load).toHaveBeenLastCalledWith("a", { offset: 0, limit: 100, failedOnly: true });
  expect(state.downloadItems.a.items[0].imageKey).toBe("failed");
});

it("fetches the new last page once if the requested page disappears after records change", async () => {
  const load = vi
    .spyOn(veneraApi, "listDownloadItemsPage")
    .mockResolvedValueOnce({ items: [], total: 101, failedTotal: 0, offset: 200, limit: 100 })
    .mockResolvedValueOnce({
      items: [{ imageKey: "last", status: "completed" }],
      total: 101,
      failedTotal: 0,
      offset: 100,
      limit: 100,
    });
  await act(async () => state.loadDownloadItems(task("a"), 200));
  expect(load).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenLastCalledWith("a", { offset: 100, limit: 100, failedOnly: false });
  expect(state.downloadItems.a.offset).toBe(100);
});

it("keeps export feedback active until preparation succeeds and does not start a browser download on failure", async () => {
  let finish!: (value: { path: string }) => void;
  const prepare = vi
    .spyOn(veneraApi, "exportDownloadCbz")
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockRejectedValueOnce(new Error("打包失败"));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  let pending: Promise<void>;
  await act(async () => {
    pending = state.downloadAction(task("a", "completed"), "download-local");
  });
  expect(state.taskOperations.a).toContain("正在准备 CBZ");
  expect(click).not.toHaveBeenCalled();
  await act(async () => {
    finish({ path: "/server/book.cbz" });
    await pending;
  });
  expect(click).toHaveBeenCalledOnce();
  expect(state.taskMessages.a).toContain("已请求浏览器");
  await act(async () => state.downloadAction(task("a", "completed"), "download-local"));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(click).toHaveBeenCalledOnce();
  expect(state.taskMessages.a).toBeUndefined();
  expect(state.taskErrors.a).toBe("打包失败");
  expect(state.taskOperations).toEqual({});
});
