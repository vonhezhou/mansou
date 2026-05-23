import { ProxyAgent } from "undici";
import { config } from "../config/config.js";

function normalizeProxyUrl(proxy: string) {
  if (!proxy) return "";
  const url = new URL(proxy);
  if (
    url.protocol === "https:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
  ) {
    url.protocol = "http:";
  }
  return url.toString();
}

const proxyUrl = normalizeProxyUrl(config.proxy);
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

function noProxyRules() {
  return config.noProxy
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function shouldBypassProxy(input: string | URL | Request) {
  if (!proxyDispatcher) return true;
  const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
  const hostname = url.hostname.toLowerCase();
  return noProxyRules().some((rule) => {
    const normalized = rule.toLowerCase();
    if (normalized === "*") return true;
    if (normalized.startsWith(".")) return hostname.endsWith(normalized);
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

export function fetchWithProxy(input: string | URL | Request, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("accept-encoding", "identity");
  return fetch(input, {
    ...init,
    headers,
    dispatcher: shouldBypassProxy(input) ? undefined : proxyDispatcher,
  } as RequestInit & { dispatcher?: ProxyAgent });
}

export function getProxyUrl() {
  return proxyUrl || null;
}

export function getNoProxyRules() {
  return noProxyRules();
}
