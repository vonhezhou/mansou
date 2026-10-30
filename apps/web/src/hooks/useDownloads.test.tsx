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
    .spyOn(veneraApi, "listDownloadItems")
    .mockRejectedValueOnce(new Error("连接失败"))
    .mockResolvedValueOnce([{ imageKey: "one", status: "failed" }]);
  await act(async () => state.loadDownloadItems(task("a")));
  expect(state.itemErrors.a).toBe("连接失败");
  expect(state.taskOperations).toEqual({});
  await act(async () => state.loadDownloadItems(task("a")));
  expect(load).toHaveBeenCalledTimes(2);
  expect(state.itemErrors.a).toBeUndefined();
  expect(state.downloadItems.a[0].imageKey).toBe("one");
});

it("blocks image retries during active downloads and uses batch retry for a stopped task", async () => {
  const retry = vi.spyOn(veneraApi, "retryDownloadItem");
  const batch = vi.spyOn(veneraApi, "retryFailedDownloadItems").mockResolvedValue({
    task: task("a"),
    retried: 1,
    results: [{ imageKey: "one", ok: true }],
  });
  vi.spyOn(veneraApi, "listDownloadItems").mockResolvedValue([]);
  await act(async () =>
    state.retryDownloadItem(task("a", "running"), { imageKey: "one", status: "failed" }),
  );
  expect(retry).not.toHaveBeenCalled();
  await act(async () => state.downloadAction(task("a"), "retry-failed"));
  expect(batch).toHaveBeenCalledWith("a");
  expect(veneraApi.listDownloadItems).toHaveBeenCalledWith("a");
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
  expect(state.taskOperations).toEqual({});
});
