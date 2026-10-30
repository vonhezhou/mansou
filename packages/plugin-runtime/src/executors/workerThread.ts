import { Worker } from "node:worker_threads";

export function createWorker(entrypoint: URL, workerData: unknown) {
  let url = entrypoint;
  if (entrypoint.pathname.endsWith(".ts")) {
    // 部分 Node 版本的 --import tsx 不会在子线程注册加载器，需在线程内显式加载。
    const bootstrap = `
      import { createRequire } from "node:module";
      const { tsImport } = createRequire(${JSON.stringify(import.meta.url)})("tsx/esm/api");
      await tsImport(${JSON.stringify(entrypoint.href)}, ${JSON.stringify(import.meta.url)});
    `;
    url = new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`);
  }
  return new Worker(url, { execArgv: [], workerData });
}
