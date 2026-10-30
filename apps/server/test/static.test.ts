import Fastify from "fastify";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerStaticRoutes } from "../src/routes/static.js";

let directory: string;
let app: ReturnType<typeof Fastify>;
const script = "export const value = '漫画源';\n".repeat(500);

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-static-"));
  const serverDir = path.join(directory, "server");
  const distDir = path.join(directory, "web", "dist");
  await mkdir(serverDir);
  await mkdir(path.join(distDir, "assets"), { recursive: true });
  await writeFile(path.join(distDir, "index.html"), "<!doctype html><title>漫搜</title>");
  await writeFile(path.join(distDir, "assets", "index-abcdefgh.js"), script);
  await writeFile(path.join(distDir, "assets", "plain.js"), script);
  vi.spyOn(process, "cwd").mockReturnValue(serverDir);
  app = Fastify();
  await registerStaticRoutes(app);
  app.get("/events", (_request, reply) => reply.type("text/event-stream").send(script));
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it.each(["br", "gzip"])(
  "compresses static scripts with %s without changing content",
  async (encoding) => {
    const response = await app.inject({
      url: "/assets/index-abcdefgh.js",
      headers: { "accept-encoding": encoding },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe(encoding);
    expect(response.headers.vary).toContain("accept-encoding");
    const decode = encoding === "br" ? brotliDecompressSync : gunzipSync;
    expect(decode(response.rawPayload).toString()).toBe(script);
    expect(response.rawPayload.length).toBeLessThan(Buffer.byteLength(script));
  },
);

it("caches hashed assets while keeping the entry page and unversioned assets fresh", async () => {
  const hashed = await app.inject("/assets/index-abcdefgh.js");
  expect(hashed.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(hashed.headers["content-encoding"]).toBeUndefined();
  expect(hashed.body).toBe(script);
  for (const url of ["/", "/assets/plain.js"]) {
    expect((await app.inject(url)).headers["cache-control"]).toBe("no-cache");
  }
  expect((await app.inject("/assets/missing-abcdefgh.js")).statusCode).toBe(404);
});

it("honors rejected encodings and leaves routes outside the static scope uncompressed", async () => {
  const headers = { "accept-encoding": "br;q=0, gzip;q=0, identity" };
  expect((await app.inject({ url: "/assets/index-abcdefgh.js", headers })).body).toBe(script);
  const events = await app.inject({ url: "/events", headers: { "accept-encoding": "gzip" } });
  expect(events.headers["content-encoding"]).toBeUndefined();
  expect(events.body).toBe(script);
});
