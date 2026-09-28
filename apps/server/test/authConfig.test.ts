import { describe, it, expect } from "vitest";
import { readAuthConfig } from "../src/auth/config.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("authentication setup", () => {
  it("rejects unsafe or ambiguous configuration", () => {
    expect(readAuthConfig({}).mode).toBe("none");
    expect(() => readAuthConfig({ AUTH_MODE: "typo" })).toThrow();
    expect(() => readAuthConfig({ VENERA_ACCESS_TOKEN: "old" })).toThrow(/停用/);
    expect(() => readAuthConfig({ AUTH_MODE: "required" })).toThrow(/AUTH_ORIGIN/);
    expect(() =>
      readAuthConfig({ AUTH_MODE: "required", AUTH_ORIGIN: "https://example.com/path" }),
    ).toThrow();
    expect(
      readAuthConfig({ AUTH_MODE: "required", AUTH_ORIGIN: "https://example.com" }).secureCookie,
    ).toBe(true);
    expect(() => readAuthConfig({ AUTH_SESSION_TTL_SECONDS: "NaN" })).toThrow();
  });
  it("uses salted Argon2id and verifies passwords", async () => {
    const password = "test-only-password";
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hashPassword(password)).not.toBe(hash);
    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });
});
