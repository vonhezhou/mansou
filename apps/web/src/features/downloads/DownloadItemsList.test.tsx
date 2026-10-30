import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DownloadItem, DownloadTask } from "../../types.js";
import { DownloadItemsList } from "./DownloadItemsList.js";

let root: Root;
let container: HTMLDivElement;
const retry = vi.fn();
const task: DownloadTask = {
  id: "task",
  sourceKey: "source",
  comicId: "comic",
  status: "paused",
  phase: "paused",
  total: 10005,
  completed: 10003,
};
const items: DownloadItem[] = Array.from({ length: 10005 }, (_, index) => ({
  image_key: `image-${index}`,
  status: index >= 10003 ? "failed" : "completed",
}));

async function render(visibleItems: DownloadItem[] = items) {
  await act(async () =>
    root.render(
      <DownloadItemsList
        busy={false}
        task={task}
        items={visibleItems}
        onRetryDownloadItem={retry}
      />,
    ),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
async function selectPage(page: number) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="下载明细页"]')!;
    select.value = String(page);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it("bounds large-task rows and preserves the exact retry target when paging", async () => {
  expect(container.querySelectorAll(".download-items > div")).toHaveLength(100);
  expect(button("上一页明细").disabled).toBe(true);
  await act(async () => button("下一页明细").click());
  expect(container.querySelector(".download-items span")?.textContent).toBe("image-100");
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".download-items button")!.click(),
  );
  expect(retry).toHaveBeenCalledWith(task, items[100]);
  await selectPage(101);
  expect(container.querySelectorAll(".download-items > div")).toHaveLength(5);
  expect(button("下一页明细").disabled).toBe(true);
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".download-items button")!.click(),
  );
  expect(retry).toHaveBeenLastCalledWith(task, items[10000]);
});

it("keeps filtered or shortened results reachable when the current page disappears", async () => {
  await selectPage(101);
  const failures = items.filter((item) => item.status === "failed");
  await render(failures);
  expect(container.querySelectorAll(".download-items > div")).toHaveLength(2);
  expect(container.querySelector('[aria-label="下载明细分页"]')).toBeNull();
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".download-items button")!.click(),
  );
  expect(retry).toHaveBeenCalledWith(task, failures[0]);
  await render([]);
  expect(container.textContent).toBe("");
});
