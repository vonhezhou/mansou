export type RuntimeOptions = {
  sourceKey?: string;
  originalSourceKey?: string;
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
