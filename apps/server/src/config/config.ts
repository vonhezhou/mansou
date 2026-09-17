import path from "node:path";

const rootDir = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 3210),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir: process.env.VENERA_DATA_DIR ?? path.join(rootDir, "data"),
  sourceListUrl:
    process.env.VENERA_SOURCE_LIST_URL ??
    "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json",
  sourceCdnBaseUrl: process.env.VENERA_SOURCE_CDN_BASE_URL ?? "",
  appVersion: process.env.VENERA_APP_VERSION ?? "1.15.0",
  locale: process.env.VENERA_LOCALE ?? "zh_CN",
  requestTimeoutMs: Number(process.env.VENERA_REQUEST_TIMEOUT_MS ?? 60000),
  pluginCallTimeoutMs: Number(
    process.env.VENERA_PLUGIN_CALL_TIMEOUT_MS ?? process.env.VENERA_REQUEST_TIMEOUT_MS ?? 60000,
  ),
  pluginSourceConcurrency: Number(process.env.VENERA_PLUGIN_SOURCE_CONCURRENCY ?? 4),
  pluginIsolation: process.env.VENERA_PLUGIN_ISOLATION ?? "vm",
  downloadConcurrency: Number(process.env.VENERA_DOWNLOAD_CONCURRENCY ?? 4),
  downloadTaskConcurrency: Number(process.env.VENERA_DOWNLOAD_TASK_CONCURRENCY ?? 1),
  downloadRetries: Number(process.env.VENERA_DOWNLOAD_RETRIES ?? 3),
  accessToken: process.env.VENERA_ACCESS_TOKEN ?? "",
  maxImageBytes: Number(process.env.VENERA_MAX_IMAGE_BYTES ?? 20 * 1024 * 1024),
  imageCacheMaxBytes: Number(process.env.VENERA_IMAGE_CACHE_MAX_BYTES ?? 1024 * 1024 * 1024),
  proxy:
    process.env.VENERA_PROXY ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    "",
  noProxy: process.env.VENERA_NO_PROXY ?? process.env.NO_PROXY ?? process.env.no_proxy ?? "",
};
