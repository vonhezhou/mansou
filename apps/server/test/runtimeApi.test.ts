import crypto from "node:crypto";
import vm from "node:vm";
import { config } from "../src/config/config.js";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SourceCookieStore } from "../src/runtime/cookieStore.js";
import { SourceDataStore } from "../src/runtime/dataStore.js";
import { createRuntimeApi } from "../src/runtime/runtimeApi.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      response.setHeader("content-type", "application/octet-stream");
      response.end(`${request.method}:${request.url}:${body.toString("hex")}`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("runtime api compatibility", () => {
  it("supports documented Network request helpers", async () => {
    const { Network } = await createRuntimeApi(
      "mock",
      new SourceDataStore(),
      new SourceCookieStore(),
    );
    const text = await Network.sendRequest("PATCH", `${baseUrl}/text`, {}, Buffer.from("ok"));
    expect(text.body).toBe("PATCH:/text:6f6b");

    const bytes = await Network.fetchBytes("PUT", `${baseUrl}/bytes`, {}, [1, 2, 3]);
    expect(Buffer.from(bytes.body).toString()).toBe("PUT:/bytes:010203");
  });

  it("supports documented Convert hash, hmac and aes helpers", async () => {
    const { Convert } = await createRuntimeApi(
      "mock",
      new SourceDataStore(),
      new SourceCookieStore(),
    );
    expect(Convert.hexEncode(Convert.sha512("abc"))).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
        "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
    expect(Convert.hmacString("key", "value", "sha256")).toBe(
      "90fbfcf15e74a36b89dbdb2a721d9aecffdfdddc5c83e27f7592594f71932481",
    );

    const key = Buffer.from("1234567890abcdef");
    const iv = Buffer.from("abcdef1234567890");
    const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update("1234567890abcdef"), cipher.final()]);
    expect(Convert.decryptAesCbc(encrypted, key, iv).toString()).toBe("1234567890abcdef");
  });

  it("matches AES standard vectors without padding, including feedback segment sizes", async () => {
    const { Convert } = await createRuntimeApi(
      "mock",
      new SourceDataStore(),
      new SourceCookieStore(),
    );
    const key = Buffer.from("2b7e151628aed2a6abf7158809cf4f3c", "hex");
    const iv = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
    const plain = Buffer.from("6bc1bee22e409f96e93d7e117393172a", "hex");
    expect(Convert.encryptAesEcb(plain, key).toString("hex")).toBe(
      "3ad77bb40d7a3660a89ecaf32466ef97",
    );
    expect(Convert.encryptAesCbc(plain, key, iv).toString("hex")).toBe(
      "7649abac8119b246cee98e9b12e9197d",
    );
    expect(Convert.encryptAesCfb(plain, key, iv, 16).toString("hex")).toBe(
      "3b3fd92eb72dad20333449f8e83cfb4a",
    );
    for (const segment of [1, 16]) {
      const cipher = crypto.createCipheriv(`aes-128-cfb${segment === 1 ? "8" : ""}`, key, iv);
      const expected = Buffer.concat([cipher.update(plain), cipher.final()]);
      expect(Convert.encryptAesCfb(plain, key, iv, segment)).toEqual(expected);
      expect(Convert.decryptAesCfb(expected, key, iv, segment)).toEqual(plain);
    }
    const ofb = crypto.createCipheriv("aes-128-ofb", key, Buffer.alloc(16));
    const expected = Buffer.concat([ofb.update(plain), ofb.final()]);
    expect(Convert.encryptAesOfb(plain, key, 16)).toEqual(expected);
    expect(Convert.decryptAesOfb(expected, key, 16)).toEqual(plain);
    expect(() => Convert.encryptAesEcb([1], key)).toThrow();
    expect(() => Convert.encryptAesCfb(plain, key, iv, 3)).toThrow();
    const context = vm.createContext({ Convert, key });
    expect(
      vm.runInContext("Convert.encryptAesEcb(new Uint8Array(16).buffer, key).length", context),
    ).toBe(16);
  });

  it("runs compute asynchronously, rejects invalid code and terminates runaway work", async () => {
    const { compute } = await createRuntimeApi(
      "mock",
      new SourceDataStore(),
      new SourceCookieStore(),
    );
    expect(await compute("async (a, b) => a + b", 2, 5)).toBe(7);
    expect(await compute("value => Convert.hexEncode(Convert.sha256(value))", "abc")).toBe(
      crypto.createHash("sha256").update("abc").digest("hex"),
    );
    await expect(compute("42")).rejects.toThrow("does not evaluate to a function");
    const timeout = config.pluginCallTimeoutMs;
    config.pluginCallTimeoutMs = 500;
    try {
      await expect(compute("() => { while (true) {} }")).rejects.toThrow(/timed out/);
    } finally {
      config.pluginCallTimeoutMs = timeout;
    }
    expect(await compute("() => 1")).toBe(1);
  });

  it("supports HtmlElement nodes, parent and sibling helpers", async () => {
    const { HtmlDocument } = await createRuntimeApi(
      "mock",
      new SourceDataStore(),
      new SourceCookieStore(),
    );
    const doc = new HtmlDocument("<main><p id='a'>one</p>text<p id='b'>two</p></main>");
    const first = doc.getElementById("a");
    expect(first.parent.localName).toBe("main");
    expect(first.nextSibling.id).toBe("b");
    expect(first.parent.nodes.map((node: { type: string }) => node.type)).toContain("text");
    expect(first.parent.nodes[0].toElement()?.id).toBe("a");
  });

  it("exposes APP as an App compatibility alias", async () => {
    const { App, APP, app, Http, Network, Storage, Data, HTML, Html, Console, Log } =
      await createRuntimeApi("mock", new SourceDataStore(), new SourceCookieStore());
    expect(APP).toBe(App);
    expect(app).toBe(App);
    expect(Http).toBe(Network);
    expect(Storage).toBe(Data);
    expect(HTML).toBe(Html);
    expect(Console).toBe(Log);
    expect(APP.version).toBe(App.version);
  });
});
