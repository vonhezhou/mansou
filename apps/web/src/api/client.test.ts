import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setCsrfToken } from "./client.js";

afterEach(() => {
  setCsrfToken("");
  vi.restoreAllMocks();
});
describe("session API client", () => {
  it("uses same-origin cookies and merges headers without losing CSRF", async () => {
    setCsrfToken("csrf-test");
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
      );
    await expect(
      api("/test", { method: "POST", body: "{}", headers: { "x-test": "value" } }),
    ).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("csrf-test");
    expect(new Headers(init.headers).get("x-test")).toBe("value");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });
  it("signals expired sessions and preserves structured errors", async () => {
    const expired = vi.fn();
    window.addEventListener("venera:unauthorized", expired);
    try {
      vi.spyOn(window, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "请先登录" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
      await expect(api("/sources")).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
        message: "请先登录",
      });
      expect(expired).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("venera:unauthorized", expired);
    }
  });
  it("does not treat an incorrect login password as an expired session", async () => {
    const expired = vi.fn();
    window.addEventListener("venera:unauthorized", expired);
    try {
      vi.spyOn(window, "fetch").mockResolvedValue(
        new Response("{}", { status: 401, headers: { "content-type": "application/json" } }),
      );
      await expect(api("/auth/login", { method: "POST" })).rejects.toThrow();
      expect(expired).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("venera:unauthorized", expired);
    }
  });
});
