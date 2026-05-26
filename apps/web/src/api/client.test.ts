import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, getAccessToken, saveAccessTokenValue, withAccessToken } from "./client.js";

function installLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      removeItem: (key: string) => data.delete(key),
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
}

describe("api client", () => {
  beforeEach(() => installLocalStorage());

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and clears access token", () => {
    saveAccessTokenValue("secret");
    expect(getAccessToken()).toBe("secret");

    saveAccessTokenValue("");
    expect(getAccessToken()).toBe("");
  });

  it("appends token to resource urls", () => {
    saveAccessTokenValue("secret");
    expect(withAccessToken("/api/v1/image?imageKey=a")).toBe("/api/v1/image?imageKey=a&access_token=secret");
  });

  it("sends bearer token and parses json", async () => {
    saveAccessTokenValue("secret");
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));

    await expect(api<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret" }) }));
  });

  it("uses server error message", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, headers: { "content-type": "application/json" } }));

    await expect(api("/broken")).rejects.toThrow("bad request");
  });
});
