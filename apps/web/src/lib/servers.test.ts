import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  initializeServers,
  normalizeServerOrigin,
  parseServerPreferences,
  readServerPreferences,
  saveServerPreferences,
  serverSwitchUrl,
  subscribeServers,
  switchServer,
} from "./servers.js";

const servers = [
  { name: "本机", origin: "http://localhost" },
  { name: "家里 NAS", origin: "https://nas.example.com" },
];

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("规范化地址并拒绝非 HTTP、凭据、路径和参数", () => {
  expect(normalizeServerOrigin(" HTTPS://NAS.EXAMPLE.COM:443/ ")).toBe("https://nas.example.com");
  expect(normalizeServerOrigin("http://[::1]:3210")).toBe("http://[::1]:3210");
  for (const value of [
    "nas:3210",
    "javascript:alert(1)",
    "ftp://nas",
    "https://user:pass@nas",
    "https://nas/api",
    "https://nas/?token=x",
    "https://nas/#x",
  ])
    expect(() => normalizeServerOrigin(value)).toThrow();
});

it("损坏的存储回退到当前服务器，拒绝重复地址和无效名单", () => {
  localStorage.setItem("mansou:servers", "broken");
  expect(readServerPreferences().servers).toEqual([
    { name: "当前服务器", origin: "http://localhost" },
  ]);
  expect(parseServerPreferences({ servers: [servers[0], servers[0]] })).toBeNull();
  expect(parseServerPreferences({ servers: [{ name: " ", origin: "http://nas" }] })).toBeNull();
  expect(
    parseServerPreferences({ servers, lastOrigin: "https://unknown.example.com" })?.lastOrigin,
  ).toBe("");
});

it("保存名单后通知多个选择器，取消订阅后停止通知", () => {
  const changed = vi.fn();
  const unsubscribe = subscribeServers(changed);
  saveServerPreferences({ servers, lastOrigin: servers[0].origin });
  expect(readServerPreferences()).toEqual({ servers, lastOrigin: servers[0].origin });
  expect(changed).toHaveBeenCalledOnce();
  unsubscribe();
  saveServerPreferences({ servers, lastOrigin: "" });
  expect(changed).toHaveBeenCalledOnce();
});

it("切换 URL 仅携带已保存的名称和地址，目标端导入后清理片段", () => {
  const url = serverSwitchUrl(servers[0].origin, { servers, lastOrigin: servers[1].origin });
  expect(() => serverSwitchUrl("https://other.example.com", { servers, lastOrigin: "" })).toThrow();
  window.history.replaceState(null, "", url);
  expect(initializeServers()).toBe(true);
  expect(readServerPreferences()).toEqual({ servers, lastOrigin: servers[0].origin });
  expect(window.location.hash).toBe("#settings");
});

it("不接受畸形外部片段，也不因片段中的 lastOrigin 自动跳转", () => {
  window.history.replaceState(null, "", "/#mansou-servers=%broken");
  expect(initializeServers()).toBe(true);
  expect(readServerPreferences().lastOrigin).toBe("");
  expect(window.location.hash).toBe("#settings");
});

it("导航时记住目标，重开首页恢复目标；显式设置链接可返回本机", () => {
  const assign = vi.fn();
  const replace = vi.fn();
  const location = { origin: "http://localhost", hash: "", assign, replace };
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { location, dispatchEvent });
  saveServerPreferences({ servers, lastOrigin: "" });
  switchServer(servers[1].origin);
  expect(readServerPreferences().lastOrigin).toBe(servers[1].origin);
  expect(assign).toHaveBeenCalledWith(
    serverSwitchUrl(servers[1].origin, { servers, lastOrigin: "" }),
  );
  expect(initializeServers()).toBe(false);
  expect(replace).toHaveBeenCalledWith(assign.mock.calls[0][0]);
  location.hash = "#settings";
  expect(initializeServers()).toBe(true);
});

it("存储被禁用时明确报错，不执行切换", () => {
  saveServerPreferences({ servers, lastOrigin: "" });
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { origin: "http://localhost", assign } });
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => switchServer(servers[1].origin)).toThrow("浏览器无法保存服务器列表");
  expect(assign).not.toHaveBeenCalled();
});
