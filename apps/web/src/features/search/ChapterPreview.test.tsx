import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChapterPreview } from "./ChapterPreview.js";

let root: Root;
let container: HTMLDivElement;
const closeDetails = vi.fn();
const images = Array.from({ length: 12 }, (_, index) => `https://example.com/${index}.jpg`);

function render(episodeId = "one") {
  return act(async () =>
    root.render(
      <dialog open onCancel={closeDetails}>
        <ChapterPreview
          detailSourceKey="source"
          details={{ id: "comic", title: "漫画", chapters: { one: "第一章", two: "第二章" } }}
          episodeId={episodeId}
          previewImages={images}
        />
      </dialog>,
    ),
  );
}
function preview() {
  return document.querySelector<HTMLDialogElement>(".preview-dialog")!;
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === label || item.textContent === label,
  )!;
}
async function key(value: string) {
  await act(async () =>
    preview().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })),
  );
}
async function swipe(dx: number, dy: number, fingers = 1) {
  const surface = preview().querySelector(".preview-dialog-image")!;
  const start = new Event("touchstart", { bubbles: true });
  Object.defineProperty(start, "touches", {
    value: Array.from({ length: fingers }, () => ({ clientX: 100, clientY: 100 })),
  });
  const end = new Event("touchend", { bubbles: true });
  Object.defineProperties(end, {
    touches: { value: [] },
    changedTouches: { value: [{ clientX: 100 + dx, clientY: 100 + dy }] },
  });
  await act(async () => {
    surface.dispatchEvent(start);
    surface.dispatchEvent(end);
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.unstubAllGlobals();
  closeDetails.mockClear();
});

it("limits enlarged previews to the first eight pages and prevents keyboard navigation beyond them", async () => {
  expect(container.querySelectorAll(".preview-thumbnail-button")).toHaveLength(8);
  await act(async () => button("放大第 8 页").click());
  expect(preview().textContent).toContain("本章共 12 页");
  expect(preview().querySelector("img")!.alt).toBe("第 8 页");
  expect(button("下一页").disabled).toBe(true);
  await key("ArrowRight");
  expect(preview().querySelector("img")!.alt).toBe("第 8 页");
  await key("ArrowLeft");
  expect(preview().querySelector("img")!.alt).toBe("第 7 页");
  await act(async () => button("上一页").click());
  expect(preview().querySelector("img")!.alt).toBe("第 6 页");
  await act(async () => button("关闭预览").click());
  await act(async () => button("放大第 1 页").click());
  expect(button("上一页").disabled).toBe(true);
  await key("ArrowLeft");
  expect(preview().querySelector("img")!.alt).toBe("第 1 页");
});

it("closes only the enlarged preview on Escape and restores its trigger without closing details", async () => {
  const trigger = button("放大第 3 页");
  trigger.focus();
  await act(async () => trigger.click());
  await act(async () =>
    preview().dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true })),
  );
  expect(preview()).toBeNull();
  expect(closeDetails).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")!.open).toBe(true);
  expect(document.activeElement).toBe(trigger);
});

it("recognizes horizontal swipes while preserving vertical scroll, small movements and pinch gestures", async () => {
  await act(async () => button("放大第 1 页").click());
  await swipe(-100, 5);
  expect(preview().querySelector("img")!.alt).toBe("第 2 页");
  await swipe(-80, 120);
  await swipe(-20, 0);
  await swipe(-100, 0, 2);
  expect(preview().querySelector("img")!.alt).toBe("第 2 页");
  await swipe(100, 0);
  expect(preview().querySelector("img")!.alt).toBe("第 1 页");
});

it("discards the enlarged page when the chapter changes and supports retrying failed full-size images", async () => {
  await act(async () => button("放大第 5 页").click());
  await act(async () => preview().querySelector("img")!.dispatchEvent(new Event("error")));
  await act(async () => button("重新加载图片").click());
  expect(preview().querySelector("img")!.src).toContain("_retry=1");
  await render("two");
  expect(preview()).toBeNull();
  await act(async () => button("放大第 1 页").click());
  expect(preview().textContent).toContain("第二章");
  expect(preview().querySelector("img")!.src).toContain("episodeId=two");
});
