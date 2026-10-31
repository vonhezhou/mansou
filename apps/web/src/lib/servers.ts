export type SavedServer = { name: string; origin: string };
export type ServerPreferences = { servers: SavedServer[]; lastOrigin: string };

const storageKey = "mansou:servers";
const transferPrefix = "#mansou-servers=";
const changeEvent = "mansou:servers-changed";
export const serverLimit = 30;

export function normalizeServerOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("请输入完整的 HTTP(S) 地址，例如 http://192.168.1.10:3210");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("服务器地址仅支持 HTTP(S) 域名或 IP 与端口，不含路径、凭据或参数");
  }
  return url.origin;
}

export function parseServerPreferences(value: unknown): ServerPreferences | null {
  if (!value || typeof value !== "object") return null;
  const { servers, lastOrigin } = value as Record<string, unknown>;
  if (!Array.isArray(servers) || servers.length > serverLimit) return null;
  const parsed: SavedServer[] = [];
  try {
    for (const server of servers) {
      if (!server || typeof server !== "object") return null;
      const { name, origin } = server as Record<string, unknown>;
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return null;
      if (typeof origin !== "string") return null;
      const normalized = normalizeServerOrigin(origin);
      if (parsed.some((item) => item.origin === normalized)) return null;
      parsed.push({ name: name.trim(), origin: normalized });
    }
  } catch {
    return null;
  }
  return {
    servers: parsed,
    lastOrigin:
      typeof lastOrigin === "string" && parsed.some((item) => item.origin === lastOrigin)
        ? lastOrigin
        : "",
  };
}

export function readServerPreferences(): ServerPreferences {
  let stored: ServerPreferences | null = null;
  try {
    stored = parseServerPreferences(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
  } catch {
    // 存储不可用或内容损坏时，仍能访问当前服务器。
  }
  const preferences = stored ?? { servers: [], lastOrigin: "" };
  if (!preferences.servers.some((server) => server.origin === window.location.origin)) {
    preferences.servers = [
      { name: "当前服务器", origin: window.location.origin },
      ...preferences.servers.slice(0, serverLimit - 1),
    ];
  }
  return preferences;
}

export function saveServerPreferences(preferences: ServerPreferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    throw new Error("浏览器无法保存服务器列表，请检查本地存储权限或剩余空间");
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeServers(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function serverSwitchUrl(origin: string, preferences: ServerPreferences): string {
  const target = normalizeServerOrigin(origin);
  if (!preferences.servers.some((server) => server.origin === target))
    throw new Error("请先保存该服务器");
  // 只传递名称和地址；片段不会发送给服务器，也不包含登录凭据。
  return `${target}/${transferPrefix}${encodeURIComponent(
    JSON.stringify({
      servers: preferences.servers,
      lastOrigin: target,
    }),
  )}`;
}

export function switchServer(origin: string) {
  if (origin === window.location.origin) return;
  const preferences = readServerPreferences();
  const url = serverSwitchUrl(origin, preferences);
  saveServerPreferences({ ...preferences, lastOrigin: origin });
  window.location.assign(url);
}

// 在挂载应用前导入名单或恢复上次服务器，避免请求发往错误的服务器。
export function initializeServers(): boolean {
  if (window.location.hash.startsWith(transferPrefix)) {
    let preferences: ServerPreferences | null = null;
    try {
      preferences = parseServerPreferences(
        JSON.parse(decodeURIComponent(window.location.hash.slice(transferPrefix.length))),
      );
    } catch {
      // 外部链接中的名单视为不可信输入。
    }
    if (preferences?.servers.some((server) => server.origin === window.location.origin)) {
      try {
        saveServerPreferences({ ...preferences, lastOrigin: window.location.origin });
      } catch {
        // 存储不可用时不阻止登录当前服务器。
      }
    }
    window.history.replaceState(null, "", "/#settings");
    return true;
  }
  const preferences = readServerPreferences();
  // 显式打开页面（如 /#settings）时保留当前服务器，提供离线目标的返回入口。
  if (
    !window.location.hash &&
    preferences.lastOrigin &&
    preferences.lastOrigin !== window.location.origin
  ) {
    window.location.replace(serverSwitchUrl(preferences.lastOrigin, preferences));
    return false;
  }
  return true;
}
