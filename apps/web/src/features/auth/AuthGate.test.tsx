import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate.js";
import { setCsrfToken } from "../../api/client.js";

let root: Root;
let container: HTMLDivElement;
let stored: Map<string, string>;
const locked = { mode: "required", authenticated: false, initialized: true };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value() {
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
  setCsrfToken("");
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<AuthGate>{() => <p>服务器工作区</p>}</AuthGate>));
}

async function fill(password: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      password,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

it("目标服务器需要鉴权时弹出登录窗口，失败可重试，成功后进入工作区", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(locked))
    .mockResolvedValueOnce(
      response({ error: { code: "UNAUTHORIZED", message: "账号或密码错误" } }, 401),
    )
    .mockResolvedValueOnce(response({ ...locked, authenticated: true, csrfToken: "csrf" }));
  vi.stubGlobal("fetch", fetch);
  await render();
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(container.querySelector("dialog")?.textContent).toContain(window.location.origin);
  expect(container.textContent).not.toContain("服务器工作区");
  await fill("wrong-password");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("账号或密码错误");
  await fill("correct-password");
  await submit();
  expect(fetch.mock.calls[2][0]).toBe("/api/v1/auth/login");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    username: "admin",
    password: "correct-password",
  });
  expect(fetch.mock.calls[2][1].credentials).toBe("same-origin");
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).toBe("服务器工作区");
  expect(JSON.stringify([...stored])).not.toContain("correct-password");
});

it("关闭登录窗口清空密码，并允许重新登录或管理其他服务器", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(locked)));
  await render();
  await fill("private-password");
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="关闭登录服务器"]')!.click(),
  );
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).toContain("管理与切换服务器");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "登录服务器")!
      .click(),
  );
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe("");
});

it.each([
  { mode: "none", authenticated: false, initialized: false },
  { mode: "required", authenticated: true, initialized: true },
])("无需登录的会话直接进入工作区：%j", async (session) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(session)));
  await render();
  expect(container.textContent).toBe("服务器工作区");
  expect(container.querySelector("dialog")).toBeNull();
});

it("未初始化管理员时显示说明，不弹出登录窗口", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...locked, initialized: false })));
  await render();
  expect(container.textContent).toContain("管理员尚未初始化");
  expect(container.querySelector("dialog")).toBeNull();
});

it("连接失败时显示错误并允许重试", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("无法连接服务器")));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("无法连接服务器");
  expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
});
