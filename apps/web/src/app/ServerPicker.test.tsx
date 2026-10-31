import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerPicker } from "./ServerPicker.js";
import { readServerPreferences } from "../lib/servers.js";
import * as serverConnections from "../lib/servers.js";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function input(index: number, value: string) {
  const element = container.querySelectorAll("input")[index];
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === label || button.textContent === label,
  )!;
  await act(async () => button.click());
}

it("卡片支持新增、地址去重、编辑与删除持久化", async () => {
  await act(async () => root.render(<ServerPicker />));
  await click("添加服务器");
  await input(0, "家里 NAS");
  await input(1, "https://nas.example.com/");
  await submit();
  expect(readServerPreferences().servers).toContainEqual({
    name: "家里 NAS",
    origin: "https://nas.example.com",
  });
  expect(container.querySelectorAll(".saved-servers article")).toHaveLength(2);

  expect(container.querySelector("form")).toBeNull();
  await click("添加服务器");
  await input(0, "重复");
  await input(1, "https://nas.example.com");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("该服务器地址已保存");
  expect(readServerPreferences().servers).toHaveLength(2);

  await click("取消");
  await click("编辑家里 NAS");
  await input(0, "云服务器");
  await input(1, "https://cloud.example.com");
  await submit();
  expect(readServerPreferences().servers).toContainEqual({
    name: "云服务器",
    origin: "https://cloud.example.com",
  });
  expect(
    readServerPreferences().servers.some((server) => server.origin === "https://nas.example.com"),
  ).toBe(false);
  await click("删除云服务器");
  expect(readServerPreferences().servers).toHaveLength(1);
  expect(container.querySelectorAll(".saved-servers article")).toHaveLength(1);
  expect(
    container.querySelector<HTMLButtonElement>('button[aria-label="删除当前服务器"]')!.disabled,
  ).toBe(true);
});

it("当前服务器只允许重命名，地址不可编辑", async () => {
  await act(async () => root.render(<ServerPicker />));
  await click("编辑当前服务器");
  expect(container.querySelectorAll("input")[1].readOnly).toBe(true);
  await input(0, "本机服务");
  await submit();
  expect(readServerPreferences().servers[0]).toEqual({
    name: "本机服务",
    origin: window.location.origin,
  });
});

it("卡片切换使用对应服务器地址，当前服务器不提供重复切换入口", async () => {
  const switchConnection = vi.spyOn(serverConnections, "switchServer").mockImplementation(() => {});
  await act(async () => root.render(<ServerPicker />));
  await click("添加服务器");
  await input(0, "家里 NAS");
  await input(1, "https://nas.example.com");
  await submit();
  await click("切换到家里 NAS");
  expect(switchConnection).toHaveBeenCalledWith("https://nas.example.com");
  expect(container.querySelector('[aria-label="切换到当前服务器"]')).toBeNull();
  expect(container.querySelector(".saved-server-current")?.textContent).toContain("当前使用");
});
