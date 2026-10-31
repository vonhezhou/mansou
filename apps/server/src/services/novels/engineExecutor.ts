import { Worker } from "node:worker_threads";
import { SourceError } from "@mansou/novel-engine";

/** 将 HTML、选择器和正则处理放在线程中，超时或取消时可终止同步解析。网络仍使用应用代理。 */
export class NovelEngineExecutor {
  private active = 0;
  private readonly queue = new Set<() => void>();
  private readonly controllers = new Set<AbortController>();
  private readonly running = new Set<Promise<unknown>>();
  private closed = false;
  constructor(
    private readonly fetcher: typeof fetch,
    private readonly timeoutMs: number,
  ) {}
  execute<T>(
    operation: "search" | "catalog" | "chapter",
    args: unknown[],
    signal?: AbortSignal,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new SourceError("CANCELLED", "小说引擎已关闭"));
    const controller = new AbortController();
    this.controllers.add(controller);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const work = this.run<T>(operation, args, combined).finally(() => {
      this.controllers.delete(controller);
      this.running.delete(work);
    });
    this.running.add(work);
    return work;
  }
  private async run<T>(operation: string, args: unknown[], signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    // 移交槽位给首个等待者，避免唤醒后与新调用争抢造成超额线程。
    if (this.active >= 4)
      await new Promise<void>((resolve, reject) => {
        const next = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          this.queue.delete(next);
          reject(signal.reason);
        };
        this.queue.add(next);
        signal.addEventListener("abort", abort, { once: true });
      });
    else this.active++;
    let worker: Worker | undefined;
    try {
      signal.throwIfAborted();
      const entry = new URL(
        import.meta.url.endsWith(".ts") ? "./engineWorker.ts" : "./engineWorker.js",
        import.meta.url,
      );
      const url = entry.pathname.endsWith(".ts")
        ? new URL(
            `data:text/javascript,${encodeURIComponent(`import {createRequire} from 'node:module'; const {tsImport}=createRequire(${JSON.stringify(import.meta.url)})('tsx/esm/api'); await tsImport(${JSON.stringify(entry.href)}, ${JSON.stringify(import.meta.url)});`)}`,
          )
        : entry;
      worker = new Worker(url, {
        execArgv: [],
        workerData: { operation, args, timeoutMs: this.timeoutMs },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      });
      const running = worker;
      const controller = new AbortController();
      const requestSignal = AbortSignal.any([signal, controller.signal]);
      try {
        return await new Promise<T>((resolve, reject) => {
          let settled = false;
          const abort = () => finish(new SourceError("CANCELLED", "小说操作已取消"));
          const timer = setTimeout(
            () => finish(new SourceError("TIMEOUT", "小说解析超时，已终止工作线程")),
            operation === "search" ? this.timeoutMs + 2000 : 120000,
          );
          signal.addEventListener("abort", abort, { once: true });
          const finish = (error: unknown, result?: T) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve(result!);
          };
          running.on("message", (message) => {
            if (message.type === "result") finish(undefined, message.result);
            else if (message.type === "error")
              finish(new SourceError(message.code ?? "SOURCE_ERROR", message.message));
            else if (message.type === "fetch")
              void this.fetch(message.url, message.options, requestSignal)
                .then(
                  (response) => running.postMessage({ id: message.id, ...response }),
                  (error) =>
                    running.postMessage({
                      id: message.id,
                      code: error instanceof SourceError ? error.code : "SOURCE_ERROR",
                      error: error instanceof Error ? error.message : String(error),
                    }),
                )
                .catch(() => {});
          });
          running.once("error", (error) => finish(error));
          running.once("exit", () => finish(new SourceError("SOURCE_ERROR", "小说工作线程已退出")));
        });
      } finally {
        controller.abort();
      }
    } finally {
      await worker?.terminate();
      const next = this.queue.values().next().value;
      if (next) {
        this.queue.delete(next);
        next();
      } else this.active--;
    }
  }
  private async fetch(url: string, options: RequestInit, signal: AbortSignal) {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    try {
      const response = await this.fetcher(url, { ...options, signal: requestSignal });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        if (reader)
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024)
              throw new SourceError("RESPONSE_TOO_LARGE", "书源响应超过 2 MiB");
            chunks.push(value);
          }
      } finally {
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
      return {
        url: response.url || url,
        status: response.status,
        headers: [...response.headers],
        body: size ? Buffer.concat(chunks) : null,
      };
    } catch (error) {
      if (error instanceof SourceError) throw error;
      if (requestSignal.aborted)
        throw new SourceError(
          signal.aborted ? "CANCELLED" : "TIMEOUT",
          signal.aborted ? "书源请求已取消" : "书源请求超时",
        );
      // fetch 的 message 常只有“fetch failed”；只透传已知原因，不暴露底层 URL 或代理凭据。
      const cause = error instanceof Error ? error.cause : undefined;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      const reasons: Record<string, string> = {
        UND_ERR_SOCKET: "对端关闭了连接",
        ECONNRESET: "连接被重置，可能在 TLS 握手阶段中断",
        ECONNREFUSED: "连接被拒绝",
        ENOTFOUND: "域名解析失败",
        EAI_AGAIN: "域名解析暂时失败",
        ENETUNREACH: "目标网络不可达",
        ETIMEDOUT: "连接超时",
        UND_ERR_CONNECT_TIMEOUT: "连接超时",
        CERT_HAS_EXPIRED: "站点证书已过期",
        UNABLE_TO_VERIFY_LEAF_SIGNATURE: "无法验证站点证书",
        DEPTH_ZERO_SELF_SIGNED_CERT: "站点使用自签名证书",
      };
      const reason =
        typeof code === "string" && Object.hasOwn(reasons, code) ? reasons[code] : undefined;
      throw new SourceError(
        "SOURCE_ERROR",
        `书源网络请求失败${reason ? `：${reason}（${code}）` : ""}，请检查站点可达性及服务器代理设置`,
      );
    }
  }

  async close() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    await Promise.allSettled([...this.running]);
  }
}
