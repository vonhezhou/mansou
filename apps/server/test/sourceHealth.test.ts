import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";

it("通过真实插件调用更新源元数据，空结果算成功且不泄漏错误原文，重载后清空", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mansou-health-"));
  const { app, context } = await buildApp(undefined, { ...readConfig(), dataDir });
  const file = path.join(dataDir, "health.js");
  try {
    await writeFile(
      file,
      `class Health extends ComicSource {
      key = "health"; name = "Health";
      search = { load: async (keyword) => {
        if (keyword === "fail") throw new Error("secret-token");
        if (keyword === "limited") throw new Error("HTTP 429 secret-token");
        return { comics: [] };
      }};
    }`,
    );
    await context.sources.loadScript(file);
    const metadata = async () => {
      const response = await app.inject("/api/v1/sources/metadata");
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("secret-token");
      return response.json().find((source: { key: string }) => source.key === "health").health;
    };
    expect(await metadata()).toMatchObject({ status: "unknown", operations: [] });
    await context.sources.sourceSettings("health");
    await expect(context.sources.comicDetails("health", "x")).rejects.toMatchObject({
      code: "SOURCE_CAPABILITY_UNSUPPORTED",
    });
    expect(await metadata()).toMatchObject({ status: "unknown", operations: [] });

    expect((await app.inject("/api/v1/search/health?keyword=empty")).statusCode).toBe(200);
    expect(await metadata()).toMatchObject({
      status: "available",
      operations: [{ successCount: 1 }],
    });
    expect((await app.inject("/api/v1/search/health?keyword=fail")).statusCode).toBe(500);
    expect(await metadata()).toMatchObject({
      status: "unstable",
      operations: [{ failureCount: 1, lastErrorCode: "PLUGIN_SOURCE_ERROR" }],
    });
    const limited = await app.inject("/api/v1/search/health?keyword=limited");
    expect(limited.json().error.message).toContain("请求频率");
    expect(limited.body).not.toContain("secret-token");
    expect(await metadata()).toMatchObject({
      status: "unstable",
      operations: [{ lastErrorCode: "PLUGIN_RATE_LIMITED" }],
    });

    await context.sources.loadScript(file);
    expect(await metadata()).toMatchObject({ status: "unknown", operations: [] });
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
