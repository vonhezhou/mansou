export const apiBase = "/api/v1";

type ApiErrorBody = { error?: { message?: string } };

export function getAccessToken() {
  return window.localStorage.getItem("venera_access_token") ?? "";
}

export function saveAccessTokenValue(value: string) {
  if (value) window.localStorage.setItem("venera_access_token", value);
  else window.localStorage.removeItem("venera_access_token");
}

export function withAccessToken(url: string) {
  const token = getAccessToken();
  if (!token) return url;
  const next = new URL(url, window.location.origin);
  next.searchParams.set("access_token", token);
  return `${next.pathname}${next.search}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok)
    throw new Error((body as ApiErrorBody)?.error?.message ?? `HTTP ${response.status}`);
  return body as T;
}
