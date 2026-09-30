import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readConfig } from "../src/config/config.js";
import { buildApp } from "../src/app.js";
const config = readConfig();

describe("source protocol (worker)", () => {
  let built: Awaited<ReturnType<typeof buildApp>>;
  let dir: string;
  let file: string;
  const original = { ...config };
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "venera-provider-"));
    config.dataDir = dir;
    built = await buildApp(undefined, config);
    file = path.join(dir, "protocol.js");
    await writeFile(
      file,
      `class Protocol extends ComicSource {
      key = "protocol"; name = "Protocol";
      settings = {
        label: { title: "Label", type: "input", validator: "^[a-z]+$", default: "original" },
        enabled: { type: "switch", default: true },
        region: { type: "select", options: [{value: "cn", text: "China"}, {value: "us"}], default: "cn" },
        refresh: { type: "callback", callback: async () => { this.saveData("settings", {label: "updated"}); } }
      };
      search = { optionList: [{ label: "Order", options: ["new-New", "old-Old"], default: "old" }], load: async (keyword, options) => ({ comics: [{id: keyword, subTitle: "alias", title: JSON.stringify({ options, logged: this.isLogged, label: this.loadSetting("label"), cookies: (await Network.getCookies("https://example.test")).map(c => c.value) }), cover: ""}] }) };
      account = {
        login: async (user, password) => { if (password !== "correct") throw new Error("secret:" + password); this.saveData("token", "ok"); await Network.setCookies("https://example.test", ["token=ok; Path=/"]); },
        logout: () => { this.deleteData("token"); }
      };
    }`,
    );
    await built.context.sources.loadScript(file);
  });
  afterAll(async () => {
    await built?.app.close();
    Object.assign(config, original);
    await rm(dir, { recursive: true, force: true });
  });
  const request = (
    suffix: string,
    method: "GET" | "PUT" | "POST" | "DELETE" = "GET",
    payload?: unknown,
  ) =>
    built.app.inject({
      method,
      url: `/api/v1/sources/protocol/${suffix}`,
      ...(payload === undefined ? {} : { payload }),
    });

  it("reports actual capabilities and preserves search options and normalized results", async () => {
    const list = await built.app.inject({ method: "GET", url: "/api/v1/sources" });
    expect(list.json()[0]).toMatchObject({
      hasSearch: true,
      hasComic: false,
      capabilities: { pages: false },
    });
    expect((await request("search-options")).json()).toEqual([
      { label: "Order", options: ["new-New", "old-Old"], default: "old" },
    ]);
    const result = await built.context.search.search("protocol", "hello");
    expect(result.comics[0]).toMatchObject({ subtitle: "alias", sourceKey: "protocol" });
    expect(JSON.parse(result.comics[0].title).options).toEqual(['"old"']);
    const partial = await built.context.search.aggregatedSearch("hello", ["protocol", "missing"]);
    expect(partial[0].result?.comics).toHaveLength(1);
    expect(partial[1].error).toContain("Source not loaded");
    await expect(built.context.sources.comicDetails("protocol", "x")).rejects.toMatchObject({
      code: "SOURCE_CAPABILITY_UNSUPPORTED",
    });
  });
  it("validates settings atomically, invokes callbacks and restores defaults", async () => {
    const invalid = await request("settings", "PUT", {
      values: { label: "valid", enabled: "false" },
    });
    expect(invalid.statusCode).toBe(400);
    expect((await request("settings")).json().values).toEqual({});
    for (const values of [
      { label: "123" },
      { region: "invalid" },
      { unknown: true },
      { refresh: "no" },
    ])
      expect((await request("settings", "PUT", { values })).statusCode).toBe(400);
    expect(
      (
        await request("settings", "PUT", {
          values: { label: "custom", enabled: false, region: "us" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      JSON.parse((await built.context.search.search("protocol", "x")).comics[0].title).label,
    ).toBe("custom");
    expect((await request("settings/refresh/invoke", "POST")).json().values.label).toBe("updated");
    expect((await request("settings", "DELETE")).json().values).toEqual({});
    expect(
      JSON.parse((await built.context.search.search("protocol", "x")).comics[0].title).label,
    ).toBe("original");
  });
  it("executes login/logout, persists state and never returns password or plugin login errors", async () => {
    expect((await request("auth")).json()).toMatchObject({
      loggedIn: false,
      methods: ["password"],
    });
    const failed = await request("auth/login", "POST", {
      method: "password",
      username: "user",
      password: "bad-secret",
    });
    expect(failed.statusCode).toBe(422);
    expect(failed.body).not.toContain("bad-secret");
    expect(JSON.stringify(built.context.sources.diagnostics())).not.toContain("bad-secret");
    expect((await request("auth")).json().loggedIn).toBe(false);
    const success = await request("auth/login", "POST", {
      method: "password",
      username: "user",
      password: "correct",
    });
    expect(success.statusCode).toBe(200);
    expect(success.json().loggedIn).toBe(true);
    expect(success.body).not.toContain("correct");
    await built.context.sources.loadScript(file);
    expect((await request("auth")).json().loggedIn).toBe(true);
    expect((await request("settings")).body).not.toContain("correct");
    expect((await request("auth/logout", "POST")).json().loggedIn).toBe(false);
    const state = JSON.parse((await built.context.search.search("protocol", "x")).comics[0].title);
    expect(state).toMatchObject({ logged: false, cookies: [] });
  });
  it("imports and clears cookies in the live plugin without reinitialization", async () => {
    expect(
      (
        await request("cookies", "PUT", {
          url: "https://example.test",
          cookies: ["session=live; Path=/"],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      JSON.parse((await built.context.search.search("protocol", "x")).comics[0].title).cookies,
    ).toEqual(["live"]);
    await request("cookies", "DELETE");
    expect(
      JSON.parse((await built.context.search.search("protocol", "x")).comics[0].title).cookies,
    ).toEqual([]);
  });
  it("supports cookie authentication and explicitly reports unsupported webview", async () => {
    const cookieFile = path.join(dir, "cookie_auth.js");
    await writeFile(
      cookieFile,
      `class CookieAuth extends ComicSource { key="cookie_auth"; name="Cookie";
      account={loginWithCookies:{fields:["token"],validate:async values=>{ await Network.setCookies("https://example.test", ["token="+values[0]]); return values[0]==="ok"; }},loginWithWebview:{url:"https://example.test/login"}};
    }`,
    );
    await built.context.sources.loadScript(cookieFile);
    const provider = built.context.sources.get("cookie_auth");
    expect(await provider.auth()).toMatchObject({
      methods: ["cookies"],
      cookieFields: ["token"],
      webview: "unsupported",
    });
    await expect(provider.login({ method: "cookies", values: ["bad"] })).rejects.toMatchObject({
      code: "SOURCE_LOGIN_FAILED",
    });
    expect(await provider.cookies()).toEqual([]);
    expect((await provider.login({ method: "cookies", values: ["ok"] })).loggedIn).toBe(true);
    expect((await provider.logout()).loggedIn).toBe(false);
  });
});
