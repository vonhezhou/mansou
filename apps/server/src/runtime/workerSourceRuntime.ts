import type { SourceImageInput } from "./sourceImage.js";
import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import type { ComicDetails, LoadedSource, SearchResult } from "../types/source.js";
import { config } from "../config/config.js";

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };
type WorkerStatus = "starting" | "running" | "crashed" | "closed";

export class WorkerSourceRuntimeAdapter {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private status: WorkerStatus = "running";
  private lastError?: string;

  constructor(
    private readonly worker: Worker,
    readonly source: LoadedSource,
    private readonly onCrash?: (sourceKey: string, error: Error) => void,
  ) {
    worker.unref();
    worker.on("message", (message: WorkerResponse) => this.handleMessage(message));
    worker.on("error", (error) => this.markCrashed(error));
    worker.on("exit", (code) => {
      if (this.status === "closed") return;
      if (code !== 0) this.markCrashed(new Error(`Plugin worker exited with code ${code}`));
      else this.status = "closed";
    });
  }

  static async load(filePath: string, onCrash?: (sourceKey: string, error: Error) => void) {
    const workerUrl = resolveWorkerUrl();
    const worker = new Worker(workerUrl, {
      execArgv: workerUrl.pathname.endsWith(".ts")
        ? ["--import", "tsx"]
        : process.execArgv.filter(
            (arg) => arg !== "--input-type=module" && !arg.startsWith("--input-type="),
          ),
      workerData: {
        filePath,
        dataDir: config.dataDir,
        appVersion: config.appVersion,
        locale: config.locale,
        timeout: config.pluginCallTimeoutMs,
        maxImageBytes: config.maxImageBytes,
      },
    });
    try {
      return new WorkerSourceRuntimeAdapter(
        worker,
        await callWorker<LoadedSource>(worker, "metadata", []),
        onCrash,
      );
    } catch (error) {
      await worker.terminate();
      throw error;
    }
  }

  loadImageBytes(input: SourceImageInput) {
    return this.call<{ data: Uint8Array; contentType: string }>("loadImageBytes", [input]);
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

  imageLoadingConfig(imageKey: string, comicId: string, episodeId: string | null) {
    return this.call<Record<string, unknown>>("imageLoadingConfig", [imageKey, comicId, episodeId]);
  }

  imageLoadFailed(imageKey: string, comicId: string, episodeId: string | null, message: string) {
    return this.call<Record<string, unknown>>("imageLoadFailed", [
      imageKey,
      comicId,
      episodeId,
      message,
    ]);
  }

  imageResponse(
    imageKey: string,
    comicId: string,
    episodeId: string | null,
    response: { status: number; headers: Record<string, string>; url: string },
  ) {
    return this.call<Record<string, unknown>>("imageResponse", [
      imageKey,
      comicId,
      episodeId,
      response,
    ]);
  }

  modifyImage(imageKey: string, comicId: string, episodeId: string | null, data: number[]) {
    return this.call<{ data?: number[] } | undefined>("modifyImage", [
      imageKey,
      comicId,
      episodeId,
      data,
    ]);
  }

  thumbnailLoadingConfig(imageKey: string) {
    return this.call<Record<string, unknown>>("thumbnailLoadingConfig", [imageKey]);
  }

  close() {
    this.status = "closed";
    this.rejectAll(new Error("Plugin worker closed"));
    return this.worker.terminate();
  }

  diagnostics() {
    return {
      sourceKey: this.source.key,
      status: this.status,
      pid: process.pid,
      threadId: this.worker.threadId,
      pendingCalls: this.pending.size,
      lastError: this.lastError,
    };
  }

  private call<T>(method: string, args: unknown[]) {
    if (this.status !== "running")
      return Promise.reject(new Error(`Plugin worker is ${this.status}: ${this.source.key}`));
    const id = this.nextId;
    this.nextId += 1;
    const timeoutMs = config.pluginCallTimeoutMs;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Plugin worker call timed out: ${method} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
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

  private markCrashed(error: Error) {
    if (this.status === "closed") return;
    this.status = "crashed";
    this.lastError = error.message;
    this.rejectAll(error);
    this.onCrash?.(this.source.key, error);
  }
}

function callWorker<T>(worker: Worker, method: string, args: unknown[]) {
  return new Promise<T>((resolve, reject) => {
    const id = 0;
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Plugin worker call timed out: ${method} after ${config.pluginCallTimeoutMs}ms`),
      );
    }, config.pluginCallTimeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
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
  const sourcePath = fileURLToPath(import.meta.url);
  if (sourcePath.endsWith(".ts"))
    return pathToFileURL(path.join(path.dirname(sourcePath), "workerSourceRuntimeWorker.ts"));
  const sibling = new URL("./workerSourceRuntimeWorker.js", import.meta.url);
  if (existsSync(fileURLToPath(sibling))) return sibling;
  const distPath = sourcePath
    .replace(`${path.sep}src${path.sep}`, `${path.sep}dist${path.sep}`)
    .replace(/\.ts$/, ".js");
  return pathToFileURL(path.join(path.dirname(distPath), "workerSourceRuntimeWorker.js"));
}
