import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

type Message = { id: number; method: string; args: unknown[] };

class ComicSourceBase {
  key = "";
}

const script = await readFile(workerData.filePath, "utf8");
const className = script.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/)?.[1];
if (!className) throw new Error("Invalid comic source: class extending ComicSource not found");

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Buffer,
  fetch,
  Comic: class Comic {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
  ComicDetails: class ComicDetails {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
  ComicSource: ComicSourceBase,
};

const context = vm.createContext(sandbox);
const source = vm.runInContext(`${script}\n;globalThis.__source = new ${className}();\n;globalThis.__source;`, context, {
  filename: workerData.filePath,
  timeout: 5000,
}) as {
  key: string;
  name: string;
  version?: string;
  url?: string;
  init?: () => Promise<void> | void;
  search?: { load?: (keyword: string, options: string[], page: number) => unknown; loadNext?: (keyword: string, options: string[], next?: string | null) => unknown; optionList?: Array<{ default?: unknown; options?: string[] }> };
  comic?: { loadInfo?: (id: string) => unknown; loadEp?: (id: string, ep?: string | null) => unknown };
};

await source.init?.();

parentPort?.on("message", async (message: Message) => {
  try {
    const result = await dispatch(message.method, message.args);
    parentPort?.postMessage({ id: message.id, ok: true, result });
  } catch (error) {
    parentPort?.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

async function dispatch(method: string, args: unknown[]) {
  if (method === "metadata") {
    return {
      key: source.key,
      name: source.name,
      version: source.version ?? "0.0.0",
      url: source.url ?? "",
      filePath: workerData.filePath,
      instance: {
        key: source.key,
        name: source.name,
        version: source.version ?? "0.0.0",
        search: source.search ? {} : undefined,
        comic: source.comic ? {} : undefined,
      },
    };
  }
  if (method === "search") {
    const [keyword, pageOrNext, options] = args as [string, string | undefined, string[] | undefined];
    const finalOptions = options ?? defaultSearchOptions();
    if (source.search?.load) return source.search.load(keyword, finalOptions, Number(pageOrNext ?? 1));
    if (source.search?.loadNext) return source.search.loadNext(keyword, finalOptions, pageOrNext ?? null);
  }
  if (method === "comicDetails") return source.comic?.loadInfo?.(String(args[0]));
  if (method === "comicPages") return source.comic?.loadEp?.(String(args[0]), args[1] == null || args[1] === "_default" ? null : String(args[1]));
  throw new Error(`Unsupported worker method: ${method}`);
}

function defaultSearchOptions() {
  return (source.search?.optionList ?? []).map((option) => {
    if (option.default !== undefined) return JSON.stringify(option.default);
    const first = option.options?.[0];
    return first?.split("-")[0] ?? "";
  });
}
