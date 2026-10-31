import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";
import { createStorage } from "@mansou/storage";
import { createNetwork } from "../host/network.js";
import { SourceDataStore } from "../host/dataStore.js";
import { SourceCookieStore } from "../host/cookieStore.js";
import { createRuntimeApi } from "../adapters/venera/runtimeApi.js";

try {
  const config = workerData.config;
  const network = createNetwork(config);
  const storage = createStorage(workerData.dataDir);
  const api = await createRuntimeApi(
    workerData.sourceKey,
    new SourceDataStore(storage, config.sourceKey),
    new SourceCookieStore(storage, config.dataDir, config.sourceKey),
    config,
    network.fetch,
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
