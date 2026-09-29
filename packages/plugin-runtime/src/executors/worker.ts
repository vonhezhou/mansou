import { Worker } from "node:worker_threads";
import type { SourceMetadata } from "@venera/core";
import type { RuntimeOptions } from "../options.js";
import { PluginRuntimeError, type PluginErrorCode } from "../errors.js";
import type { Executor, Operation, Arguments, Result } from "./protocol.js";

type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; code?: PluginErrorCode } };
export class WorkerExecutor implements Executor {
  metadata!: SourceMetadata;
  private nextId = 0;
  private status = "running";
  private lastError?: string;
  private readonly pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private constructor(
    private readonly worker: Worker,
    private readonly options: RuntimeOptions,
  ) {
    worker.unref();
    worker.on("message", (message: Response) => {
      const call = this.pending.get(message.id);
      if (!call) return;
      clearTimeout(call.timer);
      this.pending.delete(message.id);
      if (message.ok) call.resolve(message.result);
      else
        call.reject(
          new PluginRuntimeError(
            message.error.code ?? "PLUGIN_SOURCE_ERROR",
            message.error.message,
            this.metadata?.key,
          ),
        );
    });
    worker.on("error", (error) => this.fail(error));
    worker.on("exit", (code) => {
      if (this.status !== "closed") this.fail(new Error(`Plugin worker exited with code ${code}`));
    });
  }
  static async load(filePath: string, options: RuntimeOptions) {
    const url = new URL(
      import.meta.url.endsWith(".ts") ? "./workerMain.ts" : "./workerMain.js",
      import.meta.url,
    );
    const worker = new Worker(url, {
      execArgv: url.pathname.endsWith(".ts") ? ["--import", "tsx"] : [],
      workerData: { filePath, options },
    });
    const executor = new WorkerExecutor(worker, options);
    try {
      executor.metadata = await executor.call("metadata", []);
      return executor;
    } catch (error) {
      await executor.close();
      throw error;
    }
  }
  call<K extends Operation>(method: K, args: Arguments<K>): Promise<Result<K>> {
    if (this.status !== "running")
      return Promise.reject(new Error(`Plugin worker is ${this.status}`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Stop the executor as well as rejecting the request: a timed-out login must not finish later.
        this.fail(
          new PluginRuntimeError(
            "PLUGIN_TIMEOUT",
            `Plugin call timed out: ${this.metadata?.key ?? "loading"}.${method}`,
          ),
        );
        void this.worker.terminate();
      }, this.options.pluginCallTimeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async close() {
    this.fail(new Error("Plugin worker closed"));
    this.status = "closed";
    await this.worker.terminate();
  }
  diagnostics() {
    return {
      sourceKey: this.metadata?.key,
      status: this.status,
      threadId: this.worker.threadId,
      pendingCalls: this.pending.size,
      lastError: this.lastError,
    };
  }
  private fail(error: Error) {
    if (this.status !== "running") return;
    this.status = "crashed";
    this.lastError = error.message;
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }
}
