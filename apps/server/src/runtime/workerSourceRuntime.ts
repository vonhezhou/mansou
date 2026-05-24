import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import type { ComicDetails, LoadedSource, SearchResult } from "../types/source.js";
import { config } from "../config/config.js";

type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export class WorkerSourceRuntimeAdapter {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly worker: Worker, readonly source: LoadedSource) {
    worker.unref();
    worker.on("message", (message: WorkerResponse) => this.handleMessage(message));
    worker.on("error", (error) => this.rejectAll(error));
    worker.on("exit", (code) => {
      if (code !== 0) this.rejectAll(new Error(`Plugin worker exited with code ${code}`));
    });
  }

  static async load(filePath: string) {
    const worker = new Worker(resolveWorkerUrl(), { workerData: { filePath } });
    const adapter = new WorkerSourceRuntimeAdapter(worker, await callWorker<LoadedSource>(worker, "metadata", []));
    return adapter;
  }

  search(keyword: string, pageOrNext?: string, options?: string[]) {
    return this.call<SearchResult>("search", [keyword, pageOrNext, options]);
  }

  comicDetails(comicId: string) {
    return this.call<ComicDetails>("comicDetails", [comicId]);
  }

  comicPages(comicId: string, episodeId?: string | null) {
    return this.call<{ images: string[] }>("comicPages", [comicId, episodeId]);
  }

  close() {
    return this.worker.terminate();
  }

  private call<T>(method: string, args: unknown[]) {
    const id = this.nextId;
    this.nextId += 1;
    const timeoutMs = config.pluginCallTimeoutMs;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Plugin worker call timed out: ${method} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.worker.postMessage({ id, method, args });
    });
  }

  private handleMessage(message: WorkerResponse) {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error));
  }

  private rejectAll(error: Error) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function callWorker<T>(worker: Worker, method: string, args: unknown[]) {
  return new Promise<T>((resolve, reject) => {
    const id = 0;
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const onMessage = (message: WorkerResponse) => {
      if (message.id !== id) return;
      cleanup();
      if (message.ok) resolve(message.result as T);
      else reject(new Error(message.error));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number) => {
      if (code === 0) return;
      cleanup();
      reject(new Error(`Plugin worker exited with code ${code}`));
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.on("exit", onExit);
    worker.postMessage({ id, method, args });
  });
}

function resolveWorkerUrl() {
  const sibling = new URL("./workerSourceRuntimeWorker.js", import.meta.url);
  if (existsSync(fileURLToPath(sibling))) return sibling;
  const sourcePath = fileURLToPath(import.meta.url);
  const distPath = sourcePath.replace(`${path.sep}src${path.sep}`, `${path.sep}dist${path.sep}`).replace(/\.ts$/, ".js");
  return pathToFileURL(path.join(path.dirname(distPath), "workerSourceRuntimeWorker.js"));
}
