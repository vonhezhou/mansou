import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";
import { readAuthConfig } from "../src/auth/config.js";
import { hashPassword, secretHash } from "../src/auth/password.js";
const config = readConfig();

const origin = "https://mansou.test";
const options = readAuthConfig({ AUTH_MODE: "required", AUTH_ORIGIN: origin });
let built: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
let digest: string;
const password = "test-admin-password";
beforeAll(async () => {
  digest = await hashPassword(password);
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "mansou-auth-"));
  config.dataDir = dir;
  built = await buildApp(options, config);
});
afterEach(async () => {
  await built.app.close();
  await rm(dir, { recursive: true, force: true });
});
async function login() {
  const result = await built.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { username: "admin", password },
  });
  expect(result.statusCode).toBe(200);
  return {
    cookie: String(result.headers["set-cookie"]).split(";")[0],
    origin,
    "x-csrf-token": result.json().csrfToken as string,
  };
}

describe("session authentication", () => {
  it("protects subscription creation, updates and removal with authentication and CSRF", async () => {
    const requests = [
      {
        method: "POST" as const,
        url: "/api/v1/source-repository",
        payload: { name: "Repo", url: "https://repo.example/index.json", cdnBaseUrl: "" },
      },
      {
        method: "PUT" as const,
        url: "/api/v1/source-repository/default",
        payload: { name: "Repo", url: "https://repo.example/index.json", cdnBaseUrl: "" },
      },
      { method: "DELETE" as const, url: "/api/v1/source-repository/default" },
    ];
    for (const request of requests) expect((await built.app.inject(request)).statusCode).toBe(401);
    built.context.storage.auth.createAdmin("admin", digest);
    const headers = await login();
    for (const request of requests) {
      expect(
        (await built.app.inject({ ...request, headers: { cookie: headers.cookie, origin } }))
          .statusCode,
      ).toBe(403);
    }
    const deleted = await built.app.inject({
      method: "DELETE",
      url: "/api/v1/source-repository/default",
      headers,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().subscriptions).toEqual([]);
  });
  it("fails closed before initialization and exposes only minimal health", async () => {
    for (const url of [
      "/api/v1/sources",
      "/api/v1/image",
      "/api/v1/downloads/events",
      "/api/v1/downloads/task/cbz",
      "/api/v1/openapi.json",
    ]) {
      expect((await built.app.inject({ url })).statusCode).toBe(401);
    }
    expect((await built.app.inject({ url: "/api/v1/health" })).json()).toEqual({
      ok: true,
      name: "mansou",
    });
    expect((await built.app.inject({ url: "/api/v1/auth/session" })).json()).toEqual({
      mode: "required",
      authenticated: false,
      initialized: false,
    });
  });
  it("issues secure cookies, rejects missing CSRF and foreign origins, and logs out", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    const headers = await login();
    expect(headers.cookie).toMatch(/^__Host-mansou_session=/);
    const second = await built.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin },
      payload: { username: "admin", password },
    });
    expect(second.headers["set-cookie"]).toContain("HttpOnly");
    expect(second.headers["set-cookie"]).toContain("Secure");
    expect(second.headers["set-cookie"]).toContain("SameSite=Lax");
    const session = await built.app.inject({ url: "/api/v1/auth/session", headers });
    expect(session.json()).toMatchObject({ authenticated: true, username: "admin" });
    expect(session.headers["cache-control"]).toBe("no-store");
    expect((await built.app.inject({ url: "/api/v1/sources", headers })).statusCode).toBe(200);
    expect(
      (
        await built.app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: { cookie: headers.cookie, origin },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await built.app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: { ...headers, origin: "https://evil.test" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await built.app.inject({ method: "POST", url: "/api/v1/auth/logout", headers })).statusCode,
    ).toBe(200);
    expect((await built.app.inject({ url: "/api/v1/sources", headers })).statusCode).toBe(401);
  });
  it("rejects login CSRF and limits password guessing", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    const input = {
      method: "POST" as const,
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "wrong" },
    };
    expect((await built.app.inject(input)).statusCode).toBe(403);
    for (let i = 0; i < 5; i++)
      expect((await built.app.inject({ ...input, headers: { origin } })).statusCode).toBe(401);
    expect(
      (await built.app.inject({ ...input, headers: { origin, "x-forwarded-for": "1.2.3.4" } }))
        .statusCode,
    ).toBe(429);
  });
  it("revokes every session when the password changes and persists the new password", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    const headers = await login();
    const other = await login();
    const result = await built.app.inject({
      method: "PUT",
      url: "/api/v1/auth/password",
      headers,
      payload: { oldPassword: password, newPassword: "new-test-password" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toContain("Max-Age=0");
    for (const h of [headers, other])
      expect((await built.app.inject({ url: "/api/v1/sources", headers: h })).statusCode).toBe(401);
    await built.app.close();
    built = await buildApp(options, config);
    expect(
      (
        await built.app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          headers: { origin },
          payload: { username: "admin", password: "new-test-password" },
        })
      ).statusCode,
    ).toBe(200);
  });
  it("ignores legacy query and header credentials, and rejects expired sessions", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    const headers = await login();
    const value = headers.cookie.split("=")[1];
    expect(
      (await built.app.inject({ url: `/api/v1/sources?access_token=${value}` })).statusCode,
    ).toBe(401);
    expect(
      (await built.app.inject({ url: "/api/v1/sources", headers: { "x-venera-token": value } }))
        .statusCode,
    ).toBe(401);
    built.context.storage.auth.deleteSession(secretHash(value));
    built.context.storage.auth.createSession(
      { hash: secretHash(value), csrfToken: headers["x-csrf-token"], expiresAt: Date.now() - 1 },
      1,
    );
    expect((await built.app.inject({ url: "/api/v1/sources", headers })).statusCode).toBe(401);
  });
  it("allows business APIs without authentication only in explicit none mode", async () => {
    await built.app.close();
    built = await buildApp(readAuthConfig({ AUTH_MODE: "none" }), config);
    expect((await built.app.inject({ url: "/api/v1/sources" })).statusCode).toBe(200);
    expect(
      (
        await built.app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          headers: { origin },
          payload: { username: "admin", password },
        })
      ).statusCode,
    ).toBe(404);
  });
  it("issues one-time tokens and limits token clients to business APIs", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    const headers = await login();
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/auth/tokens",
      headers,
      payload: { name: "CLI", expiresAt: null },
    });
    expect(created.statusCode).toBe(200);
    const { token, entry } = created.json();
    const bearer = { authorization: `Bearer ${token}` };
    expect((await built.app.inject({ url: "/api/v1/sources", headers: bearer })).statusCode).toBe(
      200,
    );
    expect(
      (
        await built.app.inject({
          method: "POST",
          url: "/api/v1/settings/cache/images/prune",
          headers: bearer,
        })
      ).statusCode,
    ).toBe(200);
    for (const request of [
      { method: "GET" as const, url: "/api/v1/auth/tokens" },
      { method: "POST" as const, url: "/api/v1/auth/tokens", payload: { name: "escalation" } },
      {
        method: "PUT" as const,
        url: "/api/v1/auth/password",
        payload: { oldPassword: password, newPassword: password },
      },
      { method: "DELETE" as const, url: `/api/v1/auth/tokens/${entry.id}` },
    ])
      expect((await built.app.inject({ ...request, headers: bearer })).statusCode).toBe(403);
    const listed = await built.app.inject({ url: "/api/v1/auth/tokens", headers });
    expect(listed.json()).toEqual([entry]);
    expect(listed.body).not.toContain(token);
    expect(listed.body).not.toContain(secretHash(token));
    expect(
      (
        await built.app.inject({
          method: "DELETE",
          url: `/api/v1/auth/tokens/${entry.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect((await built.app.inject({ url: "/api/v1/sources", headers: bearer })).statusCode).toBe(
      401,
    );
    expect((await built.app.inject({ url: "/api/v1/sources", headers })).statusCode).toBe(200);
  });
  it("rejects expired tokens and invalid expiration dates", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    const headers = await login();
    expect(
      (
        await built.app.inject({
          method: "POST",
          url: "/api/v1/auth/tokens",
          headers,
          payload: { name: "expired", expiresAt: 1 },
        })
      ).statusCode,
    ).toBe(400);
    built.context.storage.auth.createToken(
      { id: "expired", name: "old", createdAt: 1, expiresAt: 2 },
      secretHash("old-token"),
    );
    expect(
      (
        await built.app.inject({
          url: "/api/v1/sources",
          headers: { authorization: "Bearer old-token" },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("validates auth request bodies using the YAML schema without coercion", async () => {
    built.context.storage.auth.createAdmin("admin", digest);
    for (const payload of [
      { username: "admin" },
      { username: 123, password },
      { username: "admin", password, extra: "unexpected" },
    ]) {
      const result = await built.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { origin },
        payload,
      });
      expect(result.statusCode).toBe(400);
      expect(result.json().error.code).toBe("VALIDATION_ERROR");
    }
    const headers = await login();
    expect(
      (await built.app.inject({ url: "/api/v1/auth/session", headers })).json(),
    ).not.toHaveProperty("passwordHash");
    const result = await built.app.inject({
      method: "POST",
      url: "/api/v1/auth/tokens",
      headers,
      payload: { name: "client", expiresAt: "123" },
    });
    expect(result.statusCode).toBe(400);
  });
});
