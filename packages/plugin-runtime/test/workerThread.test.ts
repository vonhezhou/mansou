import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { createWorker } from "../src/executors/workerThread.js";

it.each(["ts", "js"])(
  "loads a %s worker with relative .js imports and worker data",
  async (extension) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mansou-worker-loader-"));
    let worker: ReturnType<typeof createWorker> | undefined;
    try {
      await writeFile(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
      await writeFile(
        path.join(directory, `value.${extension}`),
        extension === "ts" ? "export const offset: number = 3;" : "export const offset = 3;",
      );
      const entrypoint = path.join(directory, `entry.${extension}`);
      await writeFile(
        entrypoint,
        `import { parentPort, workerData } from "node:worker_threads";
       import { offset } from "./value.js";
       parentPort.postMessage(workerData.value + offset);`,
      );
      worker = createWorker(pathToFileURL(entrypoint), { value: 4 });
      expect(await once(worker, "message")).toEqual([7]);
    } finally {
      await worker?.terminate();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
