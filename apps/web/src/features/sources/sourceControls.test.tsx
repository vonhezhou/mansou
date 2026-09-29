import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SourceAccountPanel } from "./SourceAccountPanel.js";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";
import { veneraApi } from "../../api/venera.js";
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(element: ReactElement) {
  await act(async () => root.render(element));
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("submits plugin credentials for the selected source and clears secrets after login", async () => {
  const auth = {
    loggedIn: false,
    methods: ["password"] as ["password"],
    cookieFields: [],
    webview: "unavailable" as const,
  };
  vi.spyOn(veneraApi, "getSourceAuth").mockResolvedValue(auth);
  const login = vi.spyOn(veneraApi, "loginSource").mockResolvedValue({ ...auth, loggedIn: true });
  await render(<SourceAccountPanel key="one" sourceKey="one" />);
  await input(container.querySelector('input[autocomplete="username"]')!, "user");
  await input(container.querySelector('input[type="password"]')!, "secret");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(login).toHaveBeenCalledWith("one", {
    method: "password",
    username: "user",
    password: "secret",
  });
  expect((container.querySelector('input[type="password"]') as HTMLInputElement).value).toBe("");
  expect(container.textContent).toContain("已登录此源");
  await render(<SourceAccountPanel key="two" sourceKey="two" />);
  expect(
    (container.querySelector('input[autocomplete="username"]') as HTMLInputElement).value,
  ).toBe("");
});
it("renders typed source settings and invokes a callback through its source endpoint", async () => {
  const change = vi.fn();
  const invoke = vi
    .spyOn(veneraApi, "invokeSourceSetting")
    .mockResolvedValue({ schema: {}, values: { label: "updated" } });
  await render(
    <SourceSettingsPanel
      sourceKey="one"
      sourceSettingsKey="one"
      busy={false}
      settingsJson={'{"enabled":false}'}
      sourceSettings={{
        schema: {
          enabled: { type: "switch", default: true, title: "启用" },
          region: { type: "select", options: [{ value: 1, text: "区域一" }], default: 1 },
          label: { type: "input", default: "original" },
          refresh: { type: "callback", buttonText: "刷新" },
        },
        values: {},
      }}
      onSettingsJsonChange={change}
      onSaveSourceSettings={vi.fn()}
      onResetSourceSettings={vi.fn()}
    />,
  );
  expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
    false,
  );
  expect((container.querySelector("select") as HTMLSelectElement).value).toBe("1");
  const button = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "刷新",
  )!;
  await act(async () => button.click());
  expect(invoke).toHaveBeenCalledWith("one", "refresh");
  expect(JSON.parse(change.mock.calls[0][0])).toEqual({ label: "updated" });
});
