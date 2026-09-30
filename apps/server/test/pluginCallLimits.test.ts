import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readConfig } from "../src/config/config.js";
import { TestSourceRuntime as SourceRuntime } from "./helpers/runtime.js";
const config = readConfig();

const originalTimeout = config.pluginCallTimeoutMs;
const originalConcurrency = config.pluginSourceConcurrency;

const runtimes: SourceRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  config.pluginCallTimeoutMs = originalTimeout;
  config.pluginSourceConcurrency = originalConcurrency;
});

async function writeSource(script: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "venera-plugin-limits-"));
  const sourceFile = path.join(dir, "limited.js");
  await writeFile(sourceFile, script, "utf8");
  return sourceFile;
}

describe("plugin call limits", () => {
  it("terminates a synchronous infinite loop and recovers after reload", async () => {
    config.pluginCallTimeoutMs = 2000;
    const runtime = new SourceRuntime(undefined, config);
    runtimes.push(runtime);
    await runtime.loadScript(
      await writeSource(`class Limited extends ComicSource {
      key = "limited";
      name = "Limited";
      search = { load: async () => { while (true) {} } };
    }`),
    );

    await expect(runtime.search("limited", "x")).rejects.toThrow(
      "Plugin call timed out: limited.search",
    );
    await runtime.loadScript(
      await writeSource(`class Recovered extends ComicSource {
      key = "limited"; name = "Recovered"; search = { load: async () => ({comics: []}) };
    }`),
    );
    expect((await runtime.search("limited", "x")).comics).toEqual([]);
  });

  it("limits concurrent calls per source", async () => {
    config.pluginCallTimeoutMs = 1000;
    config.pluginSourceConcurrency = 1;
    const runtime = new SourceRuntime(undefined, config);
    runtimes.push(runtime);
    await runtime.loadScript(
      await writeSource(`class Limited extends ComicSource {
      key = "limited";
      name = "Limited";
      search = { load: async () => {
        globalThis.active = (globalThis.active ?? 0) + 1;
        globalThis.maxActive = Math.max(globalThis.maxActive ?? 0, globalThis.active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        globalThis.active -= 1;
        return { comics: [{ id: String(globalThis.maxActive), title: "ok", cover: "" }] };
      } };
    }`),
    );

    const [first, second] = await Promise.all([
      runtime.search("limited", "x"),
      runtime.search("limited", "y"),
    ]);
    expect(first.comics[0].id).toBe("1");
    expect(second.comics[0].id).toBe("1");
  });
});
