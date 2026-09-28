import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createStorage } from "./index.js";

describe("auth persistence", () => {
  it("persists credentials and revokes sessions atomically on password reset", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "auth-storage-"));
    let storage = createStorage(dir);
    try {
      storage.auth.createAdmin("admin", "hash-1");
      expect(() => storage.auth.createAdmin("other", "hash-2")).toThrow();
      expect(
        storage.auth.createSession(
          { hash: "session-hash", csrfToken: "csrf", expiresAt: Date.now() + 60000 },
          1,
        ),
      ).toBe(true);
      storage.auth.createToken(
        { id: "client", name: "CLI", createdAt: Date.now(), expiresAt: null },
        "token-hash",
      );
      storage.close();
      storage = createStorage(dir);
      expect(storage.auth.admin()?.passwordHash).toBe("hash-1");
      expect(storage.auth.session("session-hash")).toBeTruthy();
      expect(storage.auth.changePassword("hash-2", 1)).toBe(true);
      expect(storage.auth.session("session-hash")).toBeUndefined();
      expect(
        storage.auth.createSession(
          { hash: "racing-login", csrfToken: "csrf", expiresAt: Date.now() + 60000 },
          1,
        ),
      ).toBe(false);
      expect(storage.auth.changePassword("stale-reset", 1)).toBe(false);
      expect(storage.auth.token("token-hash")).toBeTruthy();
      expect(JSON.stringify(storage.auth.tokens())).not.toContain("token-hash");
      storage.auth.deleteToken("client");
      expect(storage.auth.token("token-hash")).toBeUndefined();
      storage.auth.createSession(
        { hash: "expired", csrfToken: "csrf", expiresAt: Date.now() - 1 },
        2,
      );
      expect(storage.auth.session("expired")).toBeUndefined();
      storage.auth.createToken(
        { id: "expired", name: "expired", createdAt: 1, expiresAt: 2 },
        "expired-token",
      );
      expect(storage.auth.token("expired-token")).toBeUndefined();
    } finally {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
