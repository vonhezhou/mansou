import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as client from "../api/client.js";
import { DownloadSettingsPanel } from "./DownloadSettingsPanel.js";
import { DownloadActions } from "../features/search/DownloadActions.js";

let container: HTMLDivElement;
let root: Root;
const settings = { publicDir: "/public", personalDir: "/personal", defaultDestination: "personal" };
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(client, "api").mockResolvedValue(settings);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
    );
  });
}

it("加载并保存公共、个人目录和默认目的地", async () => {
  await act(async () => root.render(<DownloadSettingsPanel />));
  const inputs = container.querySelectorAll("input");
  expect(inputs[0].value).toBe("/public");
  expect(inputs[1].value).toBe("/personal");
  expect(container.querySelector("select")!.value).toBe("personal");
  await change(inputs[1], "/new-personal");
  await change(container.querySelector("select")!, "public");
  await act(async () => container.querySelector("button")!.click());
  expect(client.api).toHaveBeenLastCalledWith("/settings/downloads", {
    method: "PUT",
    body: JSON.stringify({
      ...settings,
      personalDir: "/new-personal",
      defaultDestination: "public",
    }),
  });
  expect(container.textContent).toContain("下载目的地已保存");
});

it("漫画下载默认个人，手动切换公共后提交所选目的地", async () => {
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
  expect(container.textContent).toContain("/personal");
  await act(async () => container.querySelector("button")!.click());
  expect(onCreateDownload).toHaveBeenLastCalledWith("selected", "personal");
  await change(container.querySelector("select")!, "public");
  expect(container.textContent).toContain("/public");
  await act(async () => container.querySelectorAll("button")[1].click());
  expect(onCreateDownload).toHaveBeenLastCalledWith("all", "public");
});

it("目的地加载失败时禁止提交下载并显示错误", async () => {
  vi.mocked(client.api).mockRejectedValue(new Error("加载失败"));
  await act(async () =>
    root.render(
      <DownloadActions
        selectedEpisodeIds={["chapter"]}
        downloadCreateStatus={null}
        onCreateDownload={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector("[role=alert]")!.textContent).toContain("加载失败");
  expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
});
