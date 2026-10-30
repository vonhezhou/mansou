import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config/config.js";

let built: Awaited<ReturnType<typeof buildApp>>;
let dir: string;
let server: Server;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "mansou-interactions-"));
  server = createServer((_request, response) => {
    setTimeout(() => response.end("Updated"), 5);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  built = await buildApp(undefined, { ...readConfig(), dataDir: dir, proxy: "", noProxy: "*" });
  for (const key of ["interactive", "other"]) {
    const file = path.join(dir, `${key}.js`);
    await writeFile(
      file,
      `class Interactive extends ComicSource {
      key = "${key}"; name = "Interactive";
      translation = { zh_CN: { Domain: "域名", Refresh: "刷新", Updated: "更新完成", Primary: "主线路" } };
      async notify() { const response = await Network.get("${endpoint}"); UI.showMessage(response.body); }
      settings = {
        background: { type: "callback", callback: () => { this.notify(); } },
        domain: { title: "Domain", type: "select", options: ["Primary", { value: "backup", text: "Domain" }], default: "Primary" },
        refresh: { type: "callback", title: "Refresh", buttonText: "Refresh", callback: () => {
          UI.showDialog("Update Success", "Confirm domains", [
            { text: "Cancel", callback: () => UI.showMessage("Cancelled") },
            { text: "Apply", callback: () => { this.saveData("settings", { domain: "backup" }); UI.showMessage("Updated"); } }
          ]);
        } }
      };
    }`,
    );
    await built.context.sources.loadScript(file);
  }
});
afterAll(async () => {
  await built?.app.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});
const invoke = () =>
  built.app.inject({ method: "POST", url: "/api/v1/sources/interactive/settings/refresh/invoke" });
const respond = (id: string, buttonIndex: number | null, source = "interactive") =>
  built.app.inject({
    method: "POST",
    url: `/api/v1/sources/${source}/settings/dialogs/${id}/respond`,
    payload: { buttonIndex },
  });

it("localizes display text without changing setting keys, defaults or accepted values", async () => {
  const result = await built.context.sources.sourceSettings("interactive");
  expect(result.schema.domain).toMatchObject({
    title: "域名",
    default: "Primary",
    options: [
      { value: "Primary", text: "主线路" },
      { value: "backup", text: "域名" },
    ],
  });
  expect(result.schema.refresh).toMatchObject({ title: "刷新", buttonText: "刷新" });
  await expect(
    built.context.sources.updateSourceSettings("interactive", { domain: "Primary" }),
  ).resolves.toMatchObject({ values: { domain: "Primary" } });
});

it("transports source dialogs across the worker boundary and requires confirmation before applying", async () => {
  const response = await invoke();
  expect(response.statusCode).toBe(200);
  const dialog = response.json().events[0];
  expect(dialog).toMatchObject({ type: "dialog", title: "更新成功", buttons: ["取消", "应用"] });
  expect((await built.context.sources.sourceSettings("interactive")).values.domain).toBe("Primary");
  expect((await respond(dialog.id, 1, "other")).statusCode).toBe(409);
  const applied = await respond(dialog.id, 1);
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toMatchObject({
    values: { domain: "backup" },
    events: [{ type: "message", message: "更新完成" }],
  });
  expect((await respond(dialog.id, 1)).statusCode).toBe(409);
});

it("cancels callbacks on dismissal and rejects dialogs from a previous worker after reload", async () => {
  const cancelled = (await invoke()).json().events[0];
  const dismiss = await respond(cancelled.id, null);
  expect(dismiss.json().events).toEqual([]);
  expect((await respond(cancelled.id, 1)).statusCode).toBe(409);
  const old = (await invoke()).json().events[0];
  const file = path.join(dir, "interactive.js");
  await built.context.sources.loadScript(file);
  expect((await respond(old.id, 1)).statusCode).toBe(409);
});

it("captures messages from source helpers that start network work without returning their Promise", async () => {
  const response = await built.app.inject({
    method: "POST",
    url: "/api/v1/sources/interactive/settings/background/invoke",
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().events).toEqual([{ type: "message", message: "更新完成" }]);
});
