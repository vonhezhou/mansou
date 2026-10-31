export const apiBase = "/api/v1";
let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiResponse(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes((init?.method ?? "GET").toUpperCase()) && csrfToken)
    headers.set("x-csrf-token", csrfToken);
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    if (response.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("mansou:unauthorized"));
    throw new ApiError(
      response.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `HTTP ${response.status}`,
    );
  }
  return response;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiResponse(path, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return body as T;
}
