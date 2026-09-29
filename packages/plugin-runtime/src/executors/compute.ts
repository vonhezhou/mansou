import { Worker } from "node:worker_threads";
import type { RuntimeOptions } from "../options.js";

let active = 0;
const queue: Array<() => void> = [];

export async function compute(
  sourceKey: string,
  func: string,
  args: unknown[],
  config: RuntimeOptions,
) {
  if (typeof func !== "string") throw new Error("Function must be a string");
  if (active >= 4) await new Promise<void>((resolve) => queue.push(resolve));
  else active++;
  let worker: Worker | undefined;
  try {
    const url = new URL(
      import.meta.url.endsWith(".ts") ? "./computeWorker.ts" : "./computeWorker.js",
      import.meta.url,
    );
    worker = new Worker(url, {
      execArgv: url.pathname.endsWith(".ts") ? ["--import", "tsx"] : [],
      workerData: {
        sourceKey,
        func,
        args,
        config,
        dataDir: config.dataDir,
        appVersion: config.appVersion,
        locale: config.locale,
        timeout: config.pluginCallTimeoutMs,
      },
    });
    const running = worker;
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Plugin compute timed out")),
        config.pluginCallTimeoutMs,
      );
      running.once("message", (message) => {
        clearTimeout(timer);
        if (message.ok) resolve(message.result);
        else reject(new Error(message.error));
      });
      running.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      running.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Plugin compute worker exited"));
      });
    });
  } finally {
    await worker?.terminate();
    const next = queue.shift();
    if (next) next();
    else active--;
  }
}
