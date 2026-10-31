import { parentPort, workerData } from "node:worker_threads";
import { searchOne, loadCatalog, loadChapter } from "@mansou/novel-engine";

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
  if (message.error) call.reject(new Error(message.error));
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
try {
  const args = workerData.args;
  const options = { timeoutMs: workerData.timeoutMs, fetcher };
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
    default:
      throw new Error("未知书源操作");
  }
  port.postMessage({ type: "result", result });
} catch (error) {
  port.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}
