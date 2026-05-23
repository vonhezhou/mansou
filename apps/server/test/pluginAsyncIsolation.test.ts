import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SourceRuntime } from "../src/runtime/sourceRuntime.js";

describe("plugin async task isolation", () => {
  it("captures detached plugin async failures without process-level unhandled rejections", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "venera-plugin-async-"));
    const sourceFile = path.join(dir, "async_bad.js");
    await writeFile(
      sourceFile,
      `class AsyncBad extends ComicSource {
        key = "async_bad";
        name = "Async Bad";
        version = "1.0.0";
        async init() {
          setTimeout(async () => { throw new Error("timer failed"); }, 0);
          new Promise((_resolve, reject) => reject(new Error("promise failed")));
          fetch("http://127.0.0.1:1/detached");
        }
      }`,
      "utf8",
    );

    const unhandled = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.on("unhandledRejection", unhandled);
    try {
      const runtime = new SourceRuntime();
      await runtime.loadScript(sourceFile);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[async_bad] plugin async task failed"), expect.anything());
    } finally {
      process.off("unhandledRejection", unhandled);
      warn.mockRestore();
    }
  });
});
