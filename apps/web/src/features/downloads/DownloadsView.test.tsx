import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadsView } from "./DownloadsView.js";
import type { DownloadsViewProps } from "./types.js";

let root: Root;
let container: HTMLDivElement;
const props: DownloadsViewProps = {
  busy: false,
  cache: null,
  downloads: [],
  downloadItems: {},
  failedItemsOnly: false,
  onFailedItemsOnlyChange: vi.fn(),
  onPruneCache: vi.fn(),
  onClearCache: vi.fn(),
  onLoadDownloadItems: vi.fn(),
  onDownloadAction: vi.fn(),
  onRetryDownloadItem: vi.fn(),
};
beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  props.downloads = Array.from({ length: 1005 }, (_, index) => ({
    id: String(index),
    sourceKey: "mock",
    comicId: `comic-${index}`,
    title: `Title ${index}`,
    status: index === 1004 ? "running" : "completed",
    phase: "completed",
    total: 1,
    completed: 1,
  }));
  props.downloadItems = { "1004": { items: [], total: 0, failedTotal: 0, offset: 0, limit: 100 } };
  await act(async () => root.render(<DownloadsView {...props} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === label,
  )!;
it("bounds task cards, keeps active tasks first and preserves expanded details across pages", async () => {
  expect(container.querySelectorAll(".download-card")).toHaveLength(50);
  expect(container.querySelector(".download-card strong")?.textContent).toBe("Title 1004");
  await act(async () => button("任务详情").click());
  expect(container.querySelector(".task-details")).not.toBeNull();
  await act(async () => button("下一页任务").click());
  await act(async () => button("上一页任务").click());
  expect(container.querySelector(".task-details")).not.toBeNull();
  expect(props.onLoadDownloadItems).toHaveBeenCalledOnce();
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="下载任务页"]')!;
    select.value = "21";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll(".download-card")).toHaveLength(5);
});
it("keeps the current page valid after the task list shrinks", async () => {
  await act(async () => button("下一页任务").click());
  props.downloads = props.downloads.slice(0, 2);
  await act(async () => root.render(<DownloadsView {...props} />));
  expect(container.querySelectorAll(".download-card")).toHaveLength(2);
  expect(container.querySelector('[aria-label="下载任务分页"]')).toBeNull();
});
it("does not show a completed percentage until the full chapter count is known", async () => {
  props.downloads = [{ ...props.downloads[0], total: 2, completed: 2, totalKnown: false }];
  await act(async () => root.render(<DownloadsView {...props} />));
  expect(container.querySelector("progress")?.hasAttribute("value")).toBe(false);
  expect(container.textContent).toContain("已完成 2 / 已发现 2 页，总页数待确认");
  expect(container.querySelector(".download-progress")?.textContent).not.toContain("100%");
  props.downloads = [{ ...props.downloads[0], totalKnown: true }];
  await act(async () => root.render(<DownloadsView {...props} />));
  expect(container.querySelector(".download-progress")?.textContent).toContain("100%");
});
