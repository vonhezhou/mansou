import { parentPort, workerData } from "node:worker_threads";
import { loadProvider } from "../adapters/index.js";
import { dispatch } from "./protocol.js";
import type { Operation, Arguments } from "./protocol.js";
import { classifyPluginError } from "../errors.js";
const { provider } = await loadProvider(workerData.filePath, workerData.options);
const metadata = await provider.metadata();
parentPort?.on(
  "message",
  async (message: { id: number; method: Operation; args: Arguments<Operation> }) => {
    try {
      const result = await dispatch(provider, message.method, message.args);
      parentPort?.postMessage({ id: message.id, ok: true, result });
    } catch (cause) {
      const error = classifyPluginError(cause, metadata.key, message.method);
      parentPort?.postMessage({
        id: message.id,
        ok: false,
        error: { code: error.code, message: error.message },
      });
    }
  },
);
