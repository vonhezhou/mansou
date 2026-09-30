import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStorage } from "@venera/storage";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";
import { readAuthConfig } from "../src/auth/config.js";
import { secretHash } from "../src/auth/password.js";
const config = readConfig();

let built: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
let base: string;
const controllers: AbortController[] = [];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "venera-stream-"));
  config.dataDir = dir;
  built = await buildApp(
    readAuthConfig({ AUTH_MODE: "required", AUTH_ORIGIN: "http://localhost" }),
    config,
  );
  built.context.storage.auth.createAdmin("admin", "unused-test-hash");
  base = await built.app.listen({ port: 0, host: "127.0.0.1" });
});
afterEach(async () => {
  controllers.splice(0).forEach((c) => c.abort());
  await built.app.close();
  await rm(dir, { recursive: true, force: true });
});
async function stream(headers: Record<string, string>) {
  const controller = new AbortController();
  controllers.push(controller);
  const response = await fetch(`${base}/api/v1/downloads/events`, {
    headers,
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: downloads");
  return reader;
}
async function closed(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let received = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += new TextDecoder().decode(chunk.value);
  }
  return received;
}

describe("authenticated SSE lifecycle", () => {
  it("closes idle session streams after an external CLI password reset", async () => {
    built.context.storage.auth.createSession(
      { hash: secretHash("session"), csrfToken: "csrf", expiresAt: Date.now() + 60000 },
      1,
    );
    const reader = await stream({ cookie: "venera_session=session" });
    const external = createStorage(dir);
    external.auth.changePassword("new-test-hash", 1);
    external.close();
    expect(await closed(reader)).toContain("event: auth-expired");
  });
  it("closes token streams on revocation and rejects reconnection", async () => {
    built.context.storage.auth.createToken(
      { id: "stream", name: "stream", createdAt: Date.now(), expiresAt: null },
      secretHash("token"),
    );
    const reader = await stream({ authorization: "Bearer token" });
    built.context.storage.auth.deleteToken("stream");
    expect(await closed(reader)).toContain("event: auth-expired");
    expect(
      (
        await fetch(`${base}/api/v1/downloads/events`, {
          headers: { authorization: "Bearer token" },
        })
      ).status,
    ).toBe(401);
  });
  it("closes expired streams and shuts down with active SSE connections", async () => {
    built.context.storage.auth.createSession(
      { hash: secretHash("short"), csrfToken: "csrf", expiresAt: Date.now() + 500 },
      1,
    );
    expect(await closed(await stream({ cookie: "venera_session=short" }))).toContain(
      "auth-expired",
    );
    built.context.storage.auth.createSession(
      { hash: secretHash("long"), csrfToken: "csrf", expiresAt: Date.now() + 60000 },
      1,
    );
    const reader = await stream({ cookie: "venera_session=long" });
    const closing = built.app.close();
    await closed(reader);
    await closing;
  });
});
