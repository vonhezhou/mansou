import { parentPort, workerData } from "node:worker_threads";
import {
  searchOne,
  loadCatalog,
  loadChapter,
  loginSource,
  SourceError,
  type RuntimeHost,
} from "@mansou/novel-engine";

const port = parentPort!;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (response: Response) => void; reject: (error: Error) => void }
>();
port.on("message", (message) => {
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id);
  if (message.error) call.reject(new SourceError(message.code ?? "SOURCE_ERROR", message.error));
  else {
    const response = new Response(message.body, {
      status: message.status,
      headers: message.headers,
    });
    Object.defineProperty(response, "url", { value: message.url });
    call.resolve(response);
  }
});
const fetcher: typeof fetch = (input, init) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const options = { ...init };
    delete options.signal;
    port.postMessage({ type: "fetch", id, url: String(input), options });
  });
let networkCalls = 0;
let sharedBuffer = new SharedArrayBuffer(4 * 1024 * 1024 + 8);
const host: RuntimeHost = (method, args) => {
  if (method === "http" && ++networkCalls > 64)
    throw new SourceError("SOURCE_ERROR", "书源脚本网络调用超过 64 次");
  const shared = sharedBuffer;
  const status = new Int32Array(shared, 0, 2);
  Atomics.store(status, 0, 0);
  Atomics.store(status, 1, 0);
  port.postMessage({ type: "host", method, args, shared });
  if (Atomics.wait(status, 0, 0, workerData.timeoutMs + 1000) === "timed-out") {
    // 超时调用仍可能迟到，换缓冲区避免它覆盖下一次调用的响应。
    sharedBuffer = new SharedArrayBuffer(4 * 1024 * 1024 + 8);
    throw new SourceError("TIMEOUT", "书源宿主调用超时");
  }
  const response = JSON.parse(
    new TextDecoder().decode(new Uint8Array(shared, 8, Atomics.load(status, 1))),
  );
  if (response.error) throw new SourceError(response.code ?? "SOURCE_ERROR", response.error);
  return response.value;
};
try {
  const args = workerData.args;
  const options = { timeoutMs: workerData.timeoutMs, fetcher, host };
  let result: unknown;
  switch (workerData.operation) {
    case "search":
      result = await searchOne(args[0], args[1], args[2], options);
      break;
    case "catalog":
      result = await loadCatalog(args[0], args[1], options);
      break;
    case "chapter":
      result = await loadChapter(args[0], args[1], args[2], options);
      break;
    case "login":
      result = await loginSource(args[0], args[1], options);
      break;
    default:
      throw new Error("未知书源操作");
  }
  port.postMessage({ type: "result", result });
} catch (error) {
  port.postMessage({
    type: "error",
    code: error instanceof SourceError ? error.code : "SOURCE_ERROR",
    message: error instanceof Error ? error.message : String(error),
  });
}
