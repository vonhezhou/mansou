import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import { createStorage } from "@mansou/storage";
import { PluginManager } from "@mansou/plugin-runtime";
import { readConfig } from "../src/config/config.js";
import { createPaths } from "../src/storage/paths.js";
import { SourceRepositoryService } from "../src/repositories/sourceRepository.js";
import { SourceService } from "../src/services/sourceService.js";

let directory: string;
let storage: ReturnType<typeof createStorage>;
let repository: SourceRepositoryService;
let service: SourceService;
let a: string;
let b: string;
let bSubscription: string;
let badScript: boolean;
const versions: Record<string, string> = {};
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-multi-subscription-"));
  const config = readConfig({
    MANSOU_DATA_DIR: directory,
    MANSOU_SOURCE_LIST_URL: "https://a.example/index.json",
    MANSOU_PROXY: "",
    MANSOU_NO_PROXY: "*",
    MANSOU_PLUGIN_CALL_TIMEOUT_MS: "5000",
  });
  badScript = false;
  versions["a.example"] = "1.0.0";
  versions["b.example"] = "1.0.0";
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const version = versions[url.hostname];
    if (url.pathname.endsWith("index.json"))
      return Response.json([{ key: "shared", name: "Shared", version, filename: "shared.js" }]);
    return new Response(`class Shared extends ComicSource {
      key = ${JSON.stringify(badScript && url.hostname === "b.example" ? "wrong-key" : "shared")};
      name = "Shared";
      version = ${JSON.stringify(version)};
      settings = { label: {type:"input", default:"initial"} };
      account = { login: (username, password) => this.saveData("marker", username), logout: () => this.deleteData("marker") };
      search = {load: async keyword => ({comics:[{id:"same",title: keyword === "compute" ? await compute("async () => await Data.load('marker')") : [this.key, this.loadSetting("label"), this.loadData("marker") ?? "guest"].join("/"), cover:"https://example.com/image.png"}],maxPage:1})};
      comic = { loadInfo: () => ({title:"Shared",cover:"",chapters:{one:"One"}}), loadEp: () => ({images:[]}) };
    }`);
  };
  storage = createStorage(directory);
  repository = new SourceRepositoryService(config, createPaths(directory), fetcher);
  service = new SourceService(new PluginManager(config), repository, storage);
  await repository.resetRepository();
  const state = await repository.createRepository({
    name: "Second",
    url: "https://b.example/index.json",
    cdnBaseUrl: "",
  });
  a = state.sources.find((s) => s.subscriptionId === "default")!.key;
  b = state.sources.find((s) => s.subscriptionId !== "default")!.key;
  bSubscription = state.subscriptions.find((s) => s.id !== "default")!.id;
  await service.install(state.sources.find((s) => s.key === a)!.installId);
  await service.install(state.sources.find((s) => s.key === b)!.installId);
});
afterEach(async () => {
  await service?.close();
  storage?.close();
  await rm(directory, { recursive: true, force: true });
});

it("isolates same-key workers, settings, account data and cookies, including after reload", async () => {
  expect(
    service
      .list()
      .map((s) => s.key)
      .sort(),
  ).toEqual([a, b].sort());
  expect(storage.getSource(a)!.script_path).not.toBe(storage.getSource(b)!.script_path);
  await service.updateSourceSettings(a, { label: "First" });
  await service.login(a, { method: "password", username: "alice", password: "a-secret" });
  expect((await service.auth(a)).loggedIn).toBe(true);
  expect((await service.auth(b)).loggedIn).toBe(false);
  expect((await service.get(a).search({ keyword: "x" })).comics[0]).toMatchObject({
    sourceKey: a,
    title: "shared/First/alice",
  });
  expect((await service.get(b).search({ keyword: "x" })).comics[0]).toMatchObject({
    sourceKey: b,
    title: "shared/initial/guest",
  });
  await service.importCookies(a, "https://example.com", ["sid=alice; Path=/"]);
  await service.importCookies(b, "https://example.com", ["sid=bob; Path=/"]);
  await service.login(b, { method: "password", username: "bob", password: "b-secret" });
  const computed = await Promise.all(
    [a, b].map((key) => service.get(key).search({ keyword: "compute" })),
  );
  expect(computed.map((result) => result.comics[0].title)).toEqual(["alice", "bob"]);
  await service.logout(a);
  expect((await service.auth(b)).loggedIn).toBe(true);
  await service.loadInstalled();
  expect((await service.get(a).search({ keyword: "x" })).comics[0].title).toBe(
    "shared/First/guest",
  );
  expect((await service.get(b).search({ keyword: "x" })).comics[0].title).toBe(
    "shared/initial/bob",
  );
  expect((await service.cookies(b)).find((cookie) => cookie.key === "sid")?.value).toBe("bob");
  expect((await service.cookies(a)).some((cookie) => cookie.value === "bob")).toBe(false);
  await service.setEnabled(a, false);
  expect(() => service.get(a)).toThrow();
  expect((await service.auth(b)).loggedIn).toBe(true);
  await service.setEnabled(a, true);
  expect((await service.sourceSettings(a)).values.label).toBe("First");
});

it("binds updates to the originating subscription and keeps installed sources after removing a subscription", async () => {
  versions["a.example"] = "2.0.0";
  versions["b.example"] = "9.0.0";
  await repository.refreshRepository();
  let metadata = await service.metadata();
  expect(metadata.find((s) => s.key === a)?.availableVersion).toBe("2.0.0");
  expect(metadata.find((s) => s.key === b)?.availableVersion).toBe("9.0.0");
  await service.install(a);
  expect(storage.getSource(a)?.version).toBe("2.0.0");
  expect(storage.getSource(b)?.version).toBe("1.0.0");
  await repository.deleteRepository(bSubscription);
  metadata = await service.metadata();
  expect(metadata.find((s) => s.key === b)).toMatchObject({
    subscriptionName: "Second（已移除）",
    availableVersion: undefined,
  });
  expect((await service.get(b).search({ keyword: "x" })).comics[0].sourceKey).toBe(b);
  await expect(service.install(b)).rejects.toThrow("订阅已移除或停用");
  const replacement = await repository.createRepository({
    name: "Replacement",
    url: "https://b.example/index.json",
    cdnBaseUrl: "",
  });
  expect(
    replacement.sources.find((source) => source.subscriptionName === "Replacement")?.key,
  ).not.toBe(b);
  await expect(service.install(b)).rejects.toThrow("订阅已移除或停用");
  const bFile = storage.getSource(b)!.script_path!;
  await service.uninstall(a);
  expect(service.list().map((s) => s.key)).toEqual([b]);
  expect(await readFile(bFile, "utf8")).toContain("class Shared");
});

it("rejects an update with a mismatched script key without replacing either live source", async () => {
  const file = storage.getSource(b)!.script_path!;
  const previous = await readFile(file, "utf8");
  badScript = true;
  await expect(service.install(b)).rejects.toThrow("key");
  expect(await readFile(file, "utf8")).toBe(previous);
  expect(
    service
      .list()
      .map((s) => s.key)
      .sort(),
  ).toEqual([a, b].sort());
  expect((await service.get(b).search({ keyword: "x" })).comics[0].sourceKey).toBe(b);
});

it("漫画收藏在订阅刷新、脚本更新、重载及移除订阅后保留且不影响同名源", async () => {
  await expect(service.setFavorite("missing", true)).rejects.toThrow("漫画源不存在");
  expect(await service.setFavorite(a, true)).toMatchObject({ key: a, favorite: true });
  expect(await service.setEnabled(a, false)).toMatchObject({ favorite: true });
  expect(await service.setEnabled(a, true)).toMatchObject({ favorite: true });
  versions["a.example"] = "2.0.0";
  await repository.refreshRepository();
  await service.install(a);
  await service.loadInstalled();
  await repository.deleteRepository("default");
  const metadata = await service.metadata();
  expect(metadata.find((source) => source.key === a)).toMatchObject({
    favorite: true,
    version: "2.0.0",
  });
  expect(metadata.find((source) => source.key === b)?.favorite).toBe(false);
  expect(await service.setFavorite(a, false)).toMatchObject({ favorite: false });
});
