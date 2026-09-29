import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createStorage } from "@venera/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config/config.js";
import { TestSourceRuntime as SourceRuntime } from "./helpers/runtime.js";
import { ImageCache } from "../src/storage/imageCache.js";
import { ImageProxyService } from "../src/services/imageProxy.js";

let server: Server;
let baseUrl: string;
let png: Buffer;
const original = { ...config };
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "venera-sync-"));
  config.dataDir = dir;
  png = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]), {
    raw: { width: 2, height: 1, channels: 4 },
  })
    .png()
    .toBuffer();
  server = createServer((req, res) => {
    if (req.url === "/error") {
      res.writeHead(403);
      res.end("denied");
      return;
    }
    if (req.url === "/png") {
      res.setHeader("content-type", "image/png");
      res.end(png);
      return;
    }
    if (req.url === "/echo") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => res.end(Buffer.concat(chunks)));
      return;
    }
    res.end(Buffer.from([1, 2, 3]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  Object.assign(config, original);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

const mode = "worker";
describe(`Flutter source compatibility (${mode})`, () => {
  let runtime: SourceRuntime;
  let proxy: ImageProxyService;
  beforeAll(async () => {
    const storage = createStorage(dir);
    runtime = new SourceRuntime(storage);
    proxy = new ImageProxyService(
      runtime,
      new ImageCache(path.join(dir, "cache"), config.imageCacheMaxBytes),
    );
    const script = `class SyncSource extends ComicSource {
        key = "sync_${mode}"; name = "Sync"; version = "1.0.0"; minAppVersion = "1.6.0";
        settings = { label: { default: "original", options: ["a", "b"] }, broken: "invalid" };
        translation = { zh_CN: { greeting: "你好" } };
        init() { this.settings.label.default = "polluted"; this.settings.label.options.push("c"); this.settings.label = "polluted"; }
        search = { load: async (keyword) => {
          if (keyword === "login") this.saveData("account", ["user", "pass"]);
          if (keyword === "logout") this.deleteData("account");
          const result = await compute("(a, b) => a + b", 2, 3);
          return { comics: [{ id: keyword, title: JSON.stringify([this.loadSetting("label"), this.translate("greeting"), this.translate("missing"), this.isLogged, result]), cover: "" }] };
        }};
        comic = { onImageLoad: (key) => {
          if (key === "retry") return { url: "${baseUrl}/error", onLoadFailed: async () => ({ url: "${baseUrl}/bytes", onResponse: bytes => Array.from(new Uint8Array(bytes)).reverse() }) };
          if (key === "fail") return { url: "${baseUrl}/error", onLoadFailed: () => ({ url: "${baseUrl}/error" }) };
          if (key === "invalid") return { url: "${baseUrl}/bytes", onResponse: () => "bad" };
          if (key === "binary") return { url: "${baseUrl}/echo", method: "POST", data: new Uint8Array([0, 128, 255]).buffer };
          if (key === "image") return { url: "${baseUrl}/png", modifyImage: ${JSON.stringify(`function modifyImage(image) {
            const target = Image.empty(image.width, image.height);
            target.fillImageAt(0, 0, image.copyRange(1, 0, 1, 1));
            target.fillImageRangeAt(1, 0, image, 0, 0, 1, 1);
            return target.copyAndRotate90();
          }`)} };
          const offset = Number(key);
          return { url: "${baseUrl}/bytes", onResponse: async bytes => {
            await new Promise(resolve => setTimeout(resolve, offset % 2 ? 20 : 1));
            if (new DataView(bytes).getUint8(0) !== 1) throw new Error("Expected ArrayBuffer");
            return new Uint8Array(Array.from(new Uint8Array(bytes), b => b + offset)).buffer;
          }};
        }};
        getThumbnailLoadingConfig = () => ({ url: "${baseUrl}/bytes", onResponse: bytes => Array.from(new Uint8Array(bytes)).reverse() });
      }`;
    const file = path.join(dir, `sync_${mode}.js`);
    await writeFile(file, script);
    await runtime.loadScript(file);
  });
  afterAll(async () => runtime.close());

  it("preserves schema, defaults and base methods despite init mutation", async () => {
    const key = `sync_${mode}`;
    expect((await runtime.sourceSettings(key)).schema).toEqual({
      label: { default: "original", options: ["a", "b"] },
    });
    const title = async (keyword: string) =>
      JSON.parse((await runtime.search(key, keyword)).comics[0].title);
    expect(await title("test")).toEqual(["original", "你好", "missing", false, 5]);
    await runtime.updateSourceSettings(key, { label: "custom" });
    expect(await title("login")).toEqual(["custom", "你好", "missing", true, 5]);
    await runtime.clearSourceSettings(key);
    expect(await title("logout")).toEqual(["original", "你好", "missing", false, 5]);
  });
  it("keeps concurrent byte callbacks request-local and supports VM ArrayBuffers", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        proxy.loadBytes({ sourceKey: `sync_${mode}`, imageKey: String(i) }, false),
      ),
    );
    expect(results.map((result) => [...result.data])).toEqual([
      [2, 3, 4],
      [3, 4, 5],
      [4, 5, 6],
      [5, 6, 7],
    ]);
  });
  it("retries HTTP failure with config callbacks, including replacement onResponse", async () => {
    const result = await proxy.loadBytes({ sourceKey: `sync_${mode}`, imageKey: "retry" }, false);
    expect([...result.data]).toEqual([3, 2, 1]);
    await expect(
      proxy.loadBytes({ sourceKey: `sync_${mode}`, imageKey: "fail" }, false),
    ).rejects.toThrow("403");
    await expect(
      proxy.loadBytes({ sourceKey: `sync_${mode}`, imageKey: "invalid" }, false),
    ).rejects.toThrow("Invalid onResponse");
  });
  it("runs thumbnail callbacks and sends binary request bodies", async () => {
    const thumb = await proxy.loadBytes(
      { sourceKey: `sync_${mode}`, imageKey: "thumb", thumbnail: true },
      false,
    );
    expect([...thumb.data]).toEqual([3, 2, 1]);
    const binary = await proxy.loadBytes({ sourceKey: `sync_${mode}`, imageKey: "binary" }, false);
    expect([...binary.data]).toEqual([0, 128, 255]);
  });
  it("executes Flutter image scripts and returns PNG with the expected pixels", async () => {
    const result = await proxy.loadBytes({ sourceKey: `sync_${mode}`, imageKey: "image" }, false);
    expect(result.contentType).toBe("image/png");
    const decoded = await sharp(result.data).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width: 1, height: 2, channels: 4 });
    expect([...decoded.data]).toEqual([0, 255, 0, 255, 255, 0, 0, 255]);
  });
  it("rejects unsupported minimum versions before init", async () => {
    const file = path.join(dir, `future_${mode}.js`);
    await writeFile(
      file,
      'class Future extends ComicSource { key = "future"; name = "Future"; minAppVersion = "999.0.0"; init() { throw new Error("init should not run"); } }',
    );
    await expect(runtime.loadScript(file)).rejects.toThrow("minAppVersion 999.0.0 is required");
  });
});
