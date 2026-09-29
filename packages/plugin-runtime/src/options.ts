export type RuntimeOptions = {
  dataDir: string;
  appVersion: string;
  locale: string;
  requestTimeoutMs: number;
  pluginCallTimeoutMs: number;
  pluginSourceConcurrency: number;
  maxImageBytes: number;
  proxy: string;
  noProxy: string;
};
