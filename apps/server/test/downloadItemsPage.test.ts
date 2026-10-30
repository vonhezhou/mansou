import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";

let directory: string;
let built: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-items-page-"));
  built = await buildApp(undefined, { ...readConfig(), dataDir: directory });
  built.context.downloads.create({ sourceKey: "mock", comicId: "comic" });
  const task = built.context.downloads.all()[0];
  task.id = "task";
  built.context.storage.saveDownload(task);
  for (let index = 0; index < 1005; index++)
    built.context.storage.saveDownloadItem({
      taskId: "task",
      imageKey: String(index).padStart(6, "0"),
      status: index % 100 === 0 ? "failed" : "completed",
      error: index === 2 ? "notice" : undefined,
    });
  built.context.storage.saveDownloadItem({
    taskId: "foreign",
    imageKey: "foreign",
    status: "failed",
  });
});
afterAll(async () => {
  await built.app.close();
  await rm(directory, { recursive: true, force: true });
});
const get = (query = "") =>
  built.app.inject({ method: "GET", url: `/api/v1/downloads/task/items/page${query}` });

it("returns bounded ordered records and task-wide totals while preserving the legacy full endpoint", async () => {
  const response = await get();
  expect(response.statusCode).toBe(200);
  const page = response.json();
  expect(page).toMatchObject({ total: 1005, failedTotal: 11, offset: 0, limit: 100 });
  expect(page.items).toHaveLength(100);
  expect(page.items[0].image_key).toBe("000000");
  const last = (await get("?offset=1000&limit=100&failedOnly=false")).json();
  expect(last.items).toHaveLength(5);
  expect(last.items[0].image_key).toBe("001000");
  expect((await get("?offset=2000")).json()).toMatchObject({ items: [], total: 1005 });
  const legacy = await built.app.inject({ method: "GET", url: "/api/v1/downloads/task/items" });
  expect(legacy.json()).toHaveLength(1005);
});

it("filters before pagination and includes nonempty errors without counting them as failed status", async () => {
  const page = (await get("?failedOnly=true&offset=1&limit=2")).json();
  expect(page).toMatchObject({ total: 12, failedTotal: 11, offset: 1, limit: 2 });
  expect(page.items.map((item: { image_key: string }) => item.image_key)).toEqual([
    "000002",
    "000100",
  ]);
});

it.each(["?limit=0", "?limit=201", "?offset=-1", "?offset=1.5", "?failedOnly=invalid"])(
  "rejects invalid query %s",
  async (query) => {
    expect((await get(query)).statusCode).toBe(400);
  },
);
it("returns 404 for an unknown task", async () => {
  expect(
    (await built.app.inject({ method: "GET", url: "/api/v1/downloads/missing/items/page" }))
      .statusCode,
  ).toBe(404);
});
