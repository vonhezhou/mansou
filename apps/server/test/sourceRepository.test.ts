import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readConfig } from "../src/config/config.js";
import { createPaths } from "../src/storage/paths.js";
import { SourceRepositoryService } from "../src/repositories/sourceRepository.js";
import { isNewerVersion } from "@venera/plugin-runtime/version";
const config = readConfig();

const paths = createPaths(config.dataDir);
const repository = new SourceRepositoryService(config, paths, fetch);
const originalConfig = { ...config };
const originalPaths = { ...paths };
let server: Server;
let base: string;
let dir: string;
let version = "1.0.0";
let filename = "old.js";
const requests: string[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "venera-repository-"));
  paths.repositoryIndex = path.join(dir, "index.json");
  paths.scripts = path.join(dir, "scripts");
  server = createServer((req, res) => {
    requests.push(req.url!);
    if (req.url!.endsWith("index.json")) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify([
          null,
          { name: "bad", version: 3 },
          { name: "Example", key: "example", version, fileName: filename },
          { name: "Example variant", key: "example", version: "1.5.0", fileName: "variant.js" },
        ]),
      );
    } else
      res.end(
        `class Example extends ComicSource { key = "example"; name = "Example"; version = "${version}"; }`,
      );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.sourceListUrl = `${base}/old/index.json`;
  config.sourceCdnBaseUrl = "";
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  Object.assign(config, originalConfig);
  Object.assign(paths, originalPaths);
  await rm(dir, { recursive: true, force: true });
});

describe("source updates", () => {
  it("refreshes stale indexes and resolves filenames against the migrated list URL", async () => {
    await repository.refreshRepository();
    version = "1.1.0";
    filename = "scripts/new.js";
    config.sourceListUrl = `${base}/migrated/index.json`;
    const installed = await repository.installSource("example");
    expect(installed.scriptUrl).toBe(`${base}/migrated/scripts/new.js`);
    expect(await readFile(installed.filePath, "utf8")).toContain('version = "1.1.0"');
    expect(requests).not.toContain("/old/old.js");
    expect(await repository.withAvailableUpdates([{ key: "example", version: "1.0.0" }])).toEqual([
      { key: "example", version: "1.0.0", availableVersion: "1.1.0" },
    ]);
    expect(await repository.withAvailableUpdates([{ key: "example", version: "1.2.0" }])).toEqual([
      { key: "example", version: "1.2.0", availableVersion: undefined },
    ]);
  });
  it("honors explicit CDN overrides", async () => {
    config.sourceCdnBaseUrl = `${base}/cdn/`;
    expect((await repository.installSource("example")).scriptUrl).toBe(
      `${base}/cdn/scripts/new.js`,
    );
  });
  it("downloads the selected filename when multiple variants share a source key", async () => {
    expect((await repository.installSource("variant.js")).scriptUrl).toBe(`${base}/cdn/variant.js`);
    expect(
      (await repository.installSource("example", undefined, `${base}/old/variant.js`)).scriptUrl,
    ).toBe(`${base}/cdn/variant.js`);
    expect(
      await repository.withAvailableUpdates([
        { key: "example", script_url: `${base}/old/variant.js`, version: "1.4.0" },
      ]),
    ).toEqual([
      {
        key: "example",
        script_url: `${base}/old/variant.js`,
        version: "1.4.0",
        availableVersion: "1.5.0",
      },
    ]);
  });
  it("restores the installed script if activation rejects the new version", async () => {
    const current = await repository.installSource("example");
    const previous = await readFile(current.filePath, "utf8");
    version = "999.0.0";
    await expect(
      repository.installSource("example", async () => {
        throw new Error("minAppVersion is required");
      }),
    ).rejects.toThrow("minAppVersion");
    expect(await readFile(current.filePath, "utf8")).toBe(previous);
  });
  it("compares numeric versions and rejects malformed versions", () => {
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.2.0+123", "1.2")).toBe(false);
    expect(isNewerVersion("1.2.0-hotfix", "1.2.0")).toBe(true);
    expect(isNewerVersion("1.2.0", "1.2.0-beta")).toBe(true);
    expect(isNewerVersion("1.2.0-beta", "1.2.0")).toBe(false);
    expect(() => isNewerVersion("unknown", "1.0.0")).toThrow("Invalid version");
  });
});
