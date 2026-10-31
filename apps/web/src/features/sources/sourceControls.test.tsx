import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SubscriptionSettings } from "./SubscriptionSettings.js";
import { CurrentSourcePanel } from "./CurrentSourcePanel.js";
import { SourceAccountPanel } from "./SourceAccountPanel.js";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";
import { SourceRepositoryPanel } from "./SourceRepositoryPanel.js";
import { mansouApi } from "../../api/mansou.js";
import type { SourceAuth } from "../../types.js";
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const passwordAuth: SourceAuth = {
  loggedIn: false,
  methods: ["password"],
  cookieFields: [],
  webview: "unavailable",
};

it("recovers a failed source account load without reloading the page", async () => {
  const response = deferred<SourceAuth>();
  const load = vi
    .spyOn(mansouApi, "getSourceAuth")
    .mockRejectedValueOnce(new Error("账号状态暂不可用"))
    .mockReturnValueOnce(response.promise);
  await render(<SourceAccountPanel sourceKey="one" />);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("账号状态暂不可用");
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(load).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenLastCalledWith("one");
  expect(container.textContent).toContain("正在加载源账号状态");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector("button")).toBeNull();
  await act(async () => response.resolve(passwordAuth));
  expect(container.textContent).toContain("未登录此源");
  expect(container.querySelector("form")).not.toBeNull();
});

it("blocks duplicate login submissions and lets a failed login recover before logout", async () => {
  vi.spyOn(mansouApi, "getSourceAuth").mockResolvedValue(passwordAuth);
  const response = deferred<SourceAuth>();
  const login = vi
    .spyOn(mansouApi, "loginSource")
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce({ ...passwordAuth, loggedIn: true });
  const logoutResponse = deferred<SourceAuth>();
  const logout = vi.spyOn(mansouApi, "logoutSource").mockReturnValue(logoutResponse.promise);
  await render(<SourceAccountPanel sourceKey="one" />);
  await input(container.querySelector('input[autocomplete="username"]')!, "user");
  await input(container.querySelector('input[type="password"]')!, "secret");
  const form = container.querySelector("form")!;
  const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => {
    submit();
    submit();
  });
  expect(login).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("正在登录此源");
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.disabled).toBe(true);
  await act(async () => response.reject(new Error("密码错误")));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("密码错误");
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.disabled).toBe(false);
  await act(async () => {
    submit();
  });
  expect(login).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "退出此源")!
      .click(),
  );
  expect(container.textContent).toContain("正在退出此源");
  expect(logout).toHaveBeenCalledWith("one");
  await act(async () => logoutResponse.resolve(passwordAuth));
  expect(container.textContent).toContain("未登录此源");
  expect(container.textContent).not.toContain("正在退出此源");
});
it("installs the exact repository variant from its card and filters sources by name", async () => {
  const install = vi.fn();
  await render(
    <SourceRepositoryPanel
      busy={false}
      sourceMetadata={[]}
      availableSources={[
        { key: "example", name: "普通版", fileName: "example.js" },
        { key: "example", name: "多账号版", fileName: "variant.js" },
      ]}
      onInstallSource={install}
      onRefreshRepository={vi.fn()}
      onReloadSources={vi.fn()}
    />,
  );
  const cards = container.querySelectorAll(".repository-source-card");
  expect(cards).toHaveLength(2);
  await act(async () => cards[1].querySelector<HTMLButtonElement>("button")!.click());
  expect(install).toHaveBeenCalledWith("variant.js");
  await input(container.querySelector('input[type="search"]')!, "多账号");
  expect(container.querySelectorAll(".repository-source-card")).toHaveLength(1);
  expect(container.querySelector(".repository-source-card")?.textContent).toContain("多账号版");
});
it("submits plugin credentials for the selected source and clears secrets after login", async () => {
  const auth = {
    loggedIn: false,
    methods: ["password"] as ["password"],
    cookieFields: [],
    webview: "unavailable" as const,
  };
  vi.spyOn(mansouApi, "getSourceAuth").mockResolvedValue(auth);
  const login = vi.spyOn(mansouApi, "loginSource").mockResolvedValue({ ...auth, loggedIn: true });
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
    .spyOn(mansouApi, "invokeSourceSetting")
    .mockResolvedValue({ schema: {}, values: { label: "updated" }, events: [] });
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
  expect(JSON.parse(change.mock.calls[0][0])).toEqual({ label: "updated", enabled: false });
});

it("blocks disabled-source settings and account requests until the source is enabled", async () => {
  const auth = vi.spyOn(mansouApi, "getSourceAuth").mockResolvedValue(passwordAuth);
  const enable = vi.fn();
  const load = vi.fn();
  const source = { key: "one", name: "One", enabled: false };
  const props = {
    busy: false,
    sourceKey: "one",
    sourceMetadata: [source],
    sourceSettings: null,
    sourceSettingsKey: "",
    settingsJson: "{}",
    cookieUrl: "",
    cookieText: "",
    onSourceChange: vi.fn(),
    onSettingsJsonChange: vi.fn(),
    onCookieUrlChange: vi.fn(),
    onCookieTextChange: vi.fn(),
    onLoadSourceSettings: load,
    onEnableSource: enable,
    onSaveSourceSettings: vi.fn(),
    onResetSourceSettings: vi.fn(),
    onImportCookies: vi.fn(),
    onClearCookies: vi.fn(),
  };
  await render(<CurrentSourcePanel mode="cookies" {...props} />);
  expect(auth).not.toHaveBeenCalled();
  expect(container.textContent).toContain("此源已禁用");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "启用此源")!
      .click(),
  );
  expect(enable).toHaveBeenCalledWith(source);
  await render(
    <CurrentSourcePanel
      mode="cookies"
      {...props}
      sourceMetadata={[{ ...source, enabled: true }]}
    />,
  );
  expect(auth).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("此源已禁用");
  expect(container.textContent).toContain("Cookie：one");
  await render(
    <CurrentSourcePanel
      {...props}
      mode="settings"
      sourceMetadata={[{ ...source, enabled: true }]}
    />,
  );
  expect(auth).toHaveBeenCalledWith("one");
  expect(container.textContent).not.toContain("Cookie：one");
});

const subscription = {
  id: "default",
  name: "Default",
  url: "https://old.example/index.json",
  cdnBaseUrl: "",
  enabled: true,
  sourceCount: 0,
};
const originalRepository = { subscriptions: [subscription], sources: [] };
async function clickLabel(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === label || item.textContent === label,
  )!;
  await act(async () => button.click());
}

it("edits a stable subscription ID, prevents duplicate saves and preserves the draft on failure", async () => {
  vi.spyOn(mansouApi, "getSourceRepository").mockResolvedValue(originalRepository);
  const response = deferred<typeof originalRepository>();
  const save = vi
    .spyOn(mansouApi, "updateSourceRepository")
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce({
      ...originalRepository,
      subscriptions: [{ ...subscription, url: "https://new.example/index.json" }],
    });
  const saved = vi.fn();
  await render(<SubscriptionSettings busy={false} onSaved={saved} />);
  expect(container.querySelector("form")).toBeNull();
  await clickLabel("编辑Default");
  const url = container.querySelector<HTMLInputElement>('input[type="url"]')!;
  await input(url, "https://new.example/index.json");
  const submit = () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => {
    submit();
    submit();
  });
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith("default", {
    name: "Default",
    url: "https://new.example/index.json",
    cdnBaseUrl: "",
    enabled: true,
  });
  await act(async () => response.reject(new Error("subscription offline")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("subscription offline");
  expect(url.value).toBe("https://new.example/index.json");
  expect(saved).not.toHaveBeenCalled();
  await act(async () => {
    submit();
  });
  expect(saved).toHaveBeenCalledWith([]);
  expect(container.querySelector("form")).toBeNull();
});

it("resets defaults despite an invalid draft, keeps other subscriptions and preserves state on failure", async () => {
  vi.spyOn(mansouApi, "getSourceRepository").mockResolvedValue(originalRepository);
  const restored = {
    subscriptions: [
      { ...subscription, url: "https://default.example/index.json" },
      { ...subscription, id: "second", name: "Second" },
    ],
    sources: [],
  };
  const pending = deferred<typeof restored>();
  const reset = vi
    .spyOn(mansouApi, "resetSourceRepository")
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(restored);
  const saved = vi.fn();
  await render(<SubscriptionSettings busy={false} onSaved={saved} />);
  await clickLabel("编辑Default");
  const url = container.querySelector<HTMLInputElement>('input[type="url"]')!;
  await input(url, "invalid draft");
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "恢复默认订阅",
  )!;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(reset).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
  await act(async () => pending.reject(new Error("default offline")));
  expect(url.value).toBe("invalid draft");
  expect(saved).not.toHaveBeenCalled();
  await act(async () => button.click());
  expect(container.textContent).toContain("Second");
  expect(container.textContent).toContain("https://default.example/index.json");
  expect(saved).toHaveBeenCalledWith([]);
});

it("creates and removes an independently identified subscription", async () => {
  vi.spyOn(mansouApi, "getSourceRepository").mockResolvedValue(originalRepository);
  const state = {
    subscriptions: [
      subscription,
      { ...subscription, id: "second", name: "Second", url: "https://second.example/index.json" },
    ],
    sources: [],
  };
  const create = vi.spyOn(mansouApi, "createSourceRepository").mockResolvedValue(state);
  const remove = vi
    .spyOn(mansouApi, "deleteSourceRepository")
    .mockResolvedValue(originalRepository);
  await render(<SubscriptionSettings busy={false} onSaved={vi.fn()} />);
  await clickLabel("添加订阅");
  await input(container.querySelector("form input:not([type])")!, "Second");
  await input(
    container.querySelector('form input[type="url"]')!,
    "https://second.example/index.json",
  );
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(create).toHaveBeenCalledWith({
    name: "Second",
    url: "https://second.example/index.json",
    cdnBaseUrl: "",
    enabled: true,
  });
  await clickLabel("移除Second");
  expect(remove).toHaveBeenCalledWith("second");
  expect(container.querySelector('[aria-label="编辑Second"]')).toBeNull();
});

it("filters subscriptions and installs the exact entry when original keys and filenames collide", async () => {
  const install = vi.fn();
  await render(
    <SourceRepositoryPanel
      busy={false}
      sourceMetadata={[{ key: "a:same", name: "Same", enabled: true }]}
      availableSources={["a", "b"].map((id) => ({
        key: `${id}:same`,
        originalKey: "same",
        installId: `${id}:same#same.js`,
        subscriptionId: id,
        subscriptionName: `Repo ${id}`,
        name: "Same",
        filename: "same.js",
      }))}
      onInstallSource={install}
      onRefreshRepository={vi.fn()}
      onReloadSources={vi.fn()}
    />,
  );
  const select = container.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const cards = container.querySelectorAll(".repository-source-card");
  expect(cards).toHaveLength(1);
  expect(cards[0].textContent).toContain("Repo b");
  expect(cards[0].textContent).not.toContain("已安装");
  await act(async () => cards[0].querySelector<HTMLButtonElement>("button")!.click());
  expect(install).toHaveBeenCalledWith("b:same#same.js");
});
