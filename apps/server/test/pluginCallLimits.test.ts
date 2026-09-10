import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/config/config.js";
import { SourceRuntime } from "../src/runtime/sourceRuntime.js";

const originalTimeout = config.pluginCallTimeoutMs;
const originalConcurrency = config.pluginSourceConcurrency;

afterEach(() => {
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
  it("times out long-running plugin calls", async () => {
    config.pluginCallTimeoutMs = 10;
    const runtime = new SourceRuntime();
    await runtime.loadScript(
      await writeSource(`class Limited extends ComicSource {
      key = "limited";
      name = "Limited";
      search = { load: async () => new Promise((resolve) => setTimeout(() => resolve({ comics: [] }), 100)) };
    }`),
    );

    await expect(runtime.search("limited", "x")).rejects.toThrow(
      "Plugin call timed out: limited.search.load",
    );
  });

  it("limits concurrent calls per source", async () => {
    config.pluginCallTimeoutMs = 1000;
    config.pluginSourceConcurrency = 1;
    const runtime = new SourceRuntime();
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
