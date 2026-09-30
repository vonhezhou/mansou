import path from "node:path";

export function readConfig(env: NodeJS.ProcessEnv = process.env, rootDir = process.cwd()) {
  const config = {
    port: Number(env.PORT ?? 3210),
    host: env.HOST ?? "0.0.0.0",
    dataDir: env.VENERA_DATA_DIR ?? path.join(rootDir, "data"),
    sourceListUrl:
      env.VENERA_SOURCE_LIST_URL ??
      "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json",
    sourceCdnBaseUrl: env.VENERA_SOURCE_CDN_BASE_URL ?? "",
    appVersion: env.VENERA_APP_VERSION ?? "1.15.0",
    locale: env.VENERA_LOCALE ?? "zh_CN",
    requestTimeoutMs: Number(env.VENERA_REQUEST_TIMEOUT_MS ?? 60000),
    pluginCallTimeoutMs: Number(
      env.VENERA_PLUGIN_CALL_TIMEOUT_MS ?? env.VENERA_REQUEST_TIMEOUT_MS ?? 60000,
    ),
    pluginSourceConcurrency: Number(env.VENERA_PLUGIN_SOURCE_CONCURRENCY ?? 4),
    downloadConcurrency: Number(env.VENERA_DOWNLOAD_CONCURRENCY ?? 4),
    downloadTaskConcurrency: Number(env.VENERA_DOWNLOAD_TASK_CONCURRENCY ?? 1),
    downloadRetries: Number(env.VENERA_DOWNLOAD_RETRIES ?? 3),
    maxImageBytes: Number(env.VENERA_MAX_IMAGE_BYTES ?? 20 * 1024 * 1024),
    imageCacheMaxBytes: Number(env.VENERA_IMAGE_CACHE_MAX_BYTES ?? 1024 * 1024 * 1024),
    proxy:
      env.VENERA_PROXY ??
      env.HTTPS_PROXY ??
      env.https_proxy ??
      env.HTTP_PROXY ??
      env.http_proxy ??
      "",
    noProxy: env.VENERA_NO_PROXY ?? env.NO_PROXY ?? env.no_proxy ?? "",
  };

  validateConfig(config);
  return config;
}
export type AppConfig = ReturnType<typeof readConfig>;

export function validateConfig(config: AppConfig) {
  for (const key of [
    "port",
    "requestTimeoutMs",
    "pluginCallTimeoutMs",
    "pluginSourceConcurrency",
    "downloadConcurrency",
    "downloadTaskConcurrency",
    "downloadRetries",
    "maxImageBytes",
    "imageCacheMaxBytes",
  ] as const) {
    const value = config[key];
    if (
      !Number.isSafeInteger(value) ||
      value < (key === "port" || key === "imageCacheMaxBytes" ? 0 : 1) ||
      (key === "port" && value > 65535)
    ) {
      throw new Error(`Invalid server configuration: ${key}`);
    }
  }
  if (!config.dataDir || !config.host) throw new Error("dataDir and host must not be empty");
}
