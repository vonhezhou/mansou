import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as client from "../api/client.js";
import { DownloadSettingsPanel } from "./DownloadSettingsPanel.js";
import { DownloadActions } from "../features/search/DownloadActions.js";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(client, "api").mockResolvedValue({ downloadDir: "/downloads" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function enterDirectory(value: string) {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("加载默认目录并保存用户设置的目录", async () => {
  await act(async () => root.render(<DownloadSettingsPanel />));
  expect(container.querySelector("input")!.placeholder).toBe("/downloads");
  await enterDirectory("/new-downloads");
  await act(async () => container.querySelector("button")!.click());
  expect(client.api).toHaveBeenLastCalledWith("/settings/downloads", {
    method: "PUT",
    body: JSON.stringify({ downloadDir: "/new-downloads" }),
  });
  expect(container.textContent).toContain("默认下载目录已保存");
});

it("漫画下载提交本次目录，清空后使用默认值", async () => {
  const onCreateDownload = vi.fn();
  await act(async () =>
    root.render(
      <DownloadActions
        selectedEpisodeIds={["chapter"]}
        downloadCreateStatus={null}
        onCreateDownload={onCreateDownload}
      />,
    ),
  );
  await enterDirectory("/this-download");
  await act(async () => container.querySelector("button")!.click());
  expect(onCreateDownload).toHaveBeenLastCalledWith("selected", "/this-download");
  await enterDirectory("");
  await act(async () => container.querySelectorAll("button")[1].click());
  expect(onCreateDownload).toHaveBeenLastCalledWith("all", undefined);
});
