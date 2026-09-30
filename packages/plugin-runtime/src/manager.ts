import type { SourceProvider, SourceRegistry, SourceMetadata } from "@venera/core";
import type { RuntimeOptions } from "./options.js";
import { WorkerExecutor } from "./executors/worker.js";
import {
  operations,
  type Executor,
  type Operation,
  type Arguments,
  type Result,
} from "./executors/protocol.js";
import { classifyPluginError, PluginRuntimeError } from "./errors.js";

type Entry = {
  filePath: string;
  executor: Executor;
  provider: SourceProvider;
  active: number;
  queue: Array<() => void>;
  closed: boolean;
};
type Diagnostic = {
  time: string;
  sourceKey?: string;
  operation: string;
  code: string;
  message: string;
  stack?: string[];
};
export class PluginManager implements SourceRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly errors: Diagnostic[] = [];
  constructor(private readonly options: RuntimeOptions) {}
  async load(filePath: string) {
    let executor: Executor;
    try {
      executor = await WorkerExecutor.load(filePath, this.options);
    } catch (error) {
      this.record(undefined, "source.load", error);
      throw error;
    }
    const key = executor.metadata.key;
    const previous = this.entries.get(key);
    const entry: Entry = {
      filePath,
      executor,
      provider: undefined as unknown as SourceProvider,
      active: 0,
      queue: [],
      closed: false,
    };
    // The executor transports only the explicitly allowed, typed source protocol.
    entry.provider = Object.fromEntries(
      [...operations].map((method) => [
        method,
        (...args: Arguments<Operation>) => this.invoke(entry, method as Operation, args),
      ]),
    ) as unknown as SourceProvider;
    this.entries.set(key, entry);
    if (previous) await this.dispose(previous);
    return { ...executor.metadata, filePath };
  }
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) throw new PluginRuntimeError("SOURCE_NOT_LOADED", `Source not loaded: ${key}`, key);
    return entry.provider;
  }
  list(): SourceMetadata[] {
    return [...this.entries.values()].map((entry) => entry.executor.metadata);
  }
  listInstalled() {
    return [...this.entries.values()].map((entry) => ({
      ...entry.executor.metadata,
      filePath: entry.filePath,
    }));
  }
  diagnostics() {
    return {
      isolation: "worker",
      loadedSources: this.list(),
      failedLoads: this.errors.filter((error) => error.operation === "source.load"),
      recentErrors: [...this.errors],
      workers: [...this.entries.values()].map((entry) => entry.executor.diagnostics()),
      sourceConcurrency: [...this.entries.values()].map((entry) => ({
        sourceKey: entry.executor.metadata.key,
        active: entry.active,
        queued: entry.queue.length,
      })),
    };
  }
  async unload(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    await this.dispose(entry);
  }
  async close() {
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((entry) => this.dispose(entry)));
  }
  private async dispose(entry: Entry) {
    entry.closed = true;
    for (const resume of entry.queue.splice(0)) resume();
    await entry.executor.close();
  }
  private async invoke<K extends Operation>(
    entry: Entry,
    operation: K,
    args: Arguments<K>,
  ): Promise<Result<K>> {
    if (entry.closed) throw new PluginRuntimeError("SOURCE_NOT_LOADED", "Source closed");
    if (entry.active >= Math.max(1, this.options.pluginSourceConcurrency))
      await new Promise<void>((resolve) => entry.queue.push(resolve));
    else entry.active++;
    if (entry.closed) throw new PluginRuntimeError("SOURCE_NOT_LOADED", "Source closed");
    try {
      return await entry.executor.call(operation, args);
    } catch (error) {
      this.record(entry.executor.metadata.key, operation, error);
      throw classifyPluginError(error, entry.executor.metadata.key, operation);
    } finally {
      const resume = entry.queue.shift();
      if (resume) resume();
      else entry.active--;
    }
  }
  private record(sourceKey: string | undefined, operation: string, cause: unknown) {
    const error = classifyPluginError(cause, sourceKey, operation);
    this.errors.unshift({
      time: new Date().toISOString(),
      sourceKey,
      operation,
      code: error.code,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 6),
    });
    this.errors.length = Math.min(this.errors.length, 100);
  }
}
