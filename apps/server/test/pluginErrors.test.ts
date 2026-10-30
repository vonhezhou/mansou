import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readConfig } from "../src/config/config.js";
import { expect, it } from "vitest";
import { PluginRuntimeError } from "@mansou/plugin-runtime";
import { buildApp } from "../src/app.js";

it("explains upstream failures without exposing plugin secrets or internal errors", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mansou-errors-"));
  const { app } = await buildApp(undefined, { ...readConfig(), dataDir });
  app.get("/plugin-error", async () => {
    throw new PluginRuntimeError("IMAGE_REJECTED", "403 https://upstream.test/?token=private");
  });
  app.get("/internal-error", async () => {
    throw new Error("private stack");
  });
  try {
    const response = await app.inject("/plugin-error");
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({
      code: "IMAGE_REJECTED",
      message: expect.stringContaining("漫画源拒绝了请求"),
    });
    expect(response.body).not.toContain("private");
    const internal = await app.inject("/internal-error");
    expect(internal.json().error.message).toBe("Internal server error");
    expect(internal.body).not.toContain("private");
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
