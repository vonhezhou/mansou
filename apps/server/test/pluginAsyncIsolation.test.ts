import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TestSourceRuntime as SourceRuntime } from "./helpers/runtime.js";

describe("plugin async task isolation", () => {
  it("captures detached plugin async failures without process-level unhandled rejections", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mansou-plugin-async-"));
    const sourceFile = path.join(dir, "async_bad.js");
    await writeFile(
      sourceFile,
      `class AsyncBad extends ComicSource {
        key = "async_bad";
        name = "Async Bad";
        version = "1.0.0";
        search = { load: async () => ({comics: []}) };
        async init() {
          setTimeout(async () => { throw new Error("timer failed"); }, 0);
          new Promise((_resolve, reject) => reject(new Error("promise failed")));
          fetch("http://127.0.0.1:1/detached");
        }
      }`,
      "utf8",
    );

    const unhandled = vi.fn();
    const runtime = new SourceRuntime();
    process.on("unhandledRejection", unhandled);
    try {
      await runtime.loadScript(sourceFile);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect((await runtime.search("async_bad", "x")).comics).toEqual([]);
    } finally {
      process.off("unhandledRejection", unhandled);
      await runtime.close();
    }
  });
});
