import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AsyncImage } from "./AsyncImage.js";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("retries a failed preview image and clears old image state when the source changes", async () => {
  await act(async () =>
    root.render(<AsyncImage src="/api/v1/image?imageKey=one" alt="第一页" retryable animate />),
  );
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.textContent).toContain("图片加载失败");
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.querySelector("img")!.src).toContain("_retry=1");
  expect(container.querySelector(".async-image")!.getAttribute("data-state")).toBe("loading");
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("load")));
  expect(container.querySelector(".async-image")!.getAttribute("data-state")).toBe("ready");
  await act(async () =>
    root.render(<AsyncImage src="/api/v1/image?imageKey=two" alt="第二页" retryable animate />),
  );
  expect(container.querySelector(".async-image")!.getAttribute("data-state")).toBe("loading");
  expect(container.querySelector("img")!.src).not.toContain("_retry");
});
