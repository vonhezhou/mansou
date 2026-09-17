import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";
import { createStorage } from "@venera/storage";
import { config } from "../config/config.js";
import { SourceDataStore } from "./dataStore.js";
import { SourceCookieStore } from "./cookieStore.js";
import { createRuntimeApi } from "./runtimeApi.js";

try {
  config.appVersion = workerData.appVersion;
  config.locale = workerData.locale;
  const storage = createStorage(workerData.dataDir);
  const api = await createRuntimeApi(
    workerData.sourceKey,
    new SourceDataStore(storage),
    new SourceCookieStore(storage),
  );
  const context = vm.createContext({
    ...api,
    Buffer,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    args: workerData.args,
  });
  const result = await vm.runInContext(
    `const fn = (${workerData.func}); if (typeof fn !== "function") throw new Error("The provided code does not evaluate to a function"); fn(...args);`,
    context,
    { timeout: workerData.timeout },
  );
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
