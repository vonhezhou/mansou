import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { novelApi, type NovelAccount } from "../../api/novels.js";
import { NovelAccountDialog } from "./NovelAccountDialog.js";

let root: Root, container: HTMLDivElement;
const account: NovelAccount = {
  loginSupported: true,
  loggedIn: false,
  fields: [
    { name: "username", label: "账号", type: "text" },
    { name: "password", label: "密码", type: "password" },
  ],
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() {} },
    close: { configurable: true, value() {} },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () =>
    root.render(
      <NovelAccountDialog source={{ id: "source-a", name: "甲源" }} onClose={() => {}} />,
    ),
  );
}
async function input(name: string, value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("按书源提交登录字段，成功后清除输入，并可退出本源会话", async () => {
  vi.spyOn(novelApi, "account").mockResolvedValue(account);
  const login = vi.spyOn(novelApi, "login").mockResolvedValue({ ...account, loggedIn: true });
  const logout = vi.spyOn(novelApi, "logout").mockResolvedValue(account);
  await open();
  await input("username", "alice");
  await input("password", "secret");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(login).toHaveBeenCalledWith(
    "source-a",
    { username: "alice", password: "secret" },
    expect.any(AbortSignal),
  );
  expect(container.textContent).toContain("已登录此书源");
  expect(container.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "退出并清除会话")!
      .click(),
  );
  expect(logout).toHaveBeenCalledWith("source-a", expect.any(AbortSignal));
  expect(container.textContent).toContain("未登录此书源");
});

it("登录失败显示错误并清除密码，不能显示已登录", async () => {
  vi.spyOn(novelApi, "account").mockResolvedValue(account);
  vi.spyOn(novelApi, "login").mockRejectedValue(new Error("账号或密码错误"));
  await open();
  await input("password", "bad");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.querySelector('[role="alert"]')!.textContent).toBe("账号或密码错误");
  expect(container.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("");
  expect(container.textContent).toContain("未登录此书源");
});

it("关闭弹窗时取消在途登录，迟到结果不能恢复弹窗", async () => {
  vi.spyOn(novelApi, "account").mockResolvedValue(account);
  let finish!: (value: NovelAccount) => void;
  const login = vi.spyOn(novelApi, "login").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await open();
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const signal = login.mock.calls[0]![2]!;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ ...account, loggedIn: true }));
  expect(container.querySelector("dialog")).toBeNull();
});

it("未配置登录的书源也能清除自动 Cookie 会话", async () => {
  const anonymous = { ...account, loginSupported: false, fields: [] };
  vi.spyOn(novelApi, "account").mockResolvedValue(anonymous);
  const logout = vi.spyOn(novelApi, "logout").mockResolvedValue(anonymous);
  await open();
  expect(container.querySelector("form")).toBeNull();
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "清除会话")!
      .click(),
  );
  expect(logout).toHaveBeenCalledWith("source-a", expect.any(AbortSignal));
});
