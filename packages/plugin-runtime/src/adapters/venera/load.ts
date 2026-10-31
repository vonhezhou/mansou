import { SourceUi } from "./sourceUi.js";
import vm from "node:vm";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { RuntimeOptions } from "../../options.js";
import { SourceDataStore } from "../../host/dataStore.js";
import { SourceCookieStore } from "../../host/cookieStore.js";
import { createNetwork } from "../../host/network.js";
import { createStorage } from "@mansou/storage";
import { createRuntimeApi } from "./runtimeApi.js";
import { createComicSourceBase, captureSettings } from "./comicSourceBase.js";
import { checkSourceVersion } from "./version.js";
import type { VeneraComicSource } from "./types.js";
import { VeneraAdapter } from "./adapter.js";

export async function loadVenera(filePath: string, options: RuntimeOptions) {
  const storage = createStorage(options.dataDir);
  const network = createNetwork(options);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let closed = false;
  const dispose = async () => {
    if (closed) return;
    closed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    storage.close();
    await network.close();
  };
  const sourceKey = options.sourceKey ?? path.basename(filePath, ".js");
  const report = () => console.warn(`[${sourceKey}] plugin async task failed`);
  const guard = <T>(value: T): T => {
    if (value && typeof (value as { catch?: unknown }).catch === "function")
      (value as unknown as Promise<unknown>).catch(report);
    return value;
  };
  const timer =
    (repeat: boolean) =>
    (fn: (...args: unknown[]) => unknown, delay?: number, ...args: unknown[]) => {
      if (closed) throw new Error("Source closed");
      const handle = (repeat ? setInterval : setTimeout)(() => {
        if (!repeat) timers.delete(handle);
        if (closed) return;
        try {
          guard(fn(...args));
        } catch {
          report();
        }
      }, delay);
      timers.add(handle);
      return handle;
    };
  function GuardedPromise<T>(executor: ConstructorParameters<typeof Promise<T>>[0]) {
    return guard(new Promise<T>(executor));
  }
  Object.setPrototypeOf(GuardedPromise, Promise);
  GuardedPromise.prototype = Promise.prototype;
  try {
    let source: VeneraComicSource | undefined = undefined;
    const common: Record<string, string> = options.locale.startsWith("zh")
      ? {
          Cancel: "取消",
          Apply: "应用",
          Close: "关闭",
          OK: "确定",
          "Update Success": "更新成功",
          "Update Failed": "更新失败",
        }
      : {};
    const ui = new SourceUi((text) => {
      const translated = source?.translate?.(text) ?? text;
      return translated !== text ? translated : (common[text] ?? text);
    });
    const sourceFetch: typeof fetch = (...args) =>
      ui.track(network.fetch(...args).then((response) => ui.observeResponse(response)));
    const data = new SourceDataStore(storage, options.sourceKey);
    const cookies = new SourceCookieStore(storage, options.dataDir, options.sourceKey);
    const base = createComicSourceBase(data, options.locale);
    const api = await createRuntimeApi(sourceKey, data, cookies, options, sourceFetch, (promise) =>
      ui.track(promise),
    );
    const script = await readFile(filePath, "utf8");
    const className = script.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/)?.[1];
    if (!className) throw new Error("Invalid comic source: class extending ComicSource not found");
    const sandbox = {
      ...api,
      console,
      Buffer,
      URL,
      URLSearchParams,
      TextDecoder,
      TextEncoder,
      setTimeout: timer(false),
      setInterval: timer(true),
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => {
        clearTimeout(handle);
        timers.delete(handle);
      },
      clearInterval: (handle: ReturnType<typeof setTimeout>) => {
        clearInterval(handle);
        timers.delete(handle);
      },
      Promise: GuardedPromise,
      fetch: (...args: Parameters<typeof fetch>) => guard(sourceFetch(...args)),
      randomInt: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
      Comic: class {
        constructor(value: object) {
          Object.assign(this, value);
        }
      },
      ComicDetails: class {
        constructor(value: object) {
          Object.assign(this, value);
        }
      },
      ComicSource: base,
      UI: {
        showMessage: (message: unknown) => ui.message(message),
        showDialog: (...args: Parameters<SourceUi["dialog"]>) => ui.dialog(...args),
        toast: (message: unknown) => ui.message(message),
      },
    };
    Object.assign(sandbox, { globalThis: sandbox, self: sandbox, window: sandbox });
    const context = vm.createContext(sandbox);
    source = vm.runInContext(`${script}\n;new ${className}();`, context, {
      filename: filePath,
      timeout: options.pluginCallTimeoutMs,
    }) as VeneraComicSource;
    if (!source.key || !source.name) throw new Error("Invalid comic source: key/name is required");
    if (options.originalSourceKey && source.key !== options.originalSourceKey)
      throw new Error("漫画源脚本 key 与订阅声明不一致");
    checkSourceVersion(source.minAppVersion, options.appVersion);
    captureSettings(source);
    let initTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve(source.init?.()),
        new Promise<never>((_, reject) => {
          initTimer = setTimeout(
            () => reject(new Error("Plugin init timed out")),
            options.pluginCallTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (initTimer) clearTimeout(initTimer);
    }
    base.sources[source.key] = source;
    const provider = new VeneraAdapter(source, data, cookies, api, options, sourceFetch, ui);
    return { provider, close: dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
