import { createStorage } from "@venera/storage";
import { PluginManager } from "@venera/plugin-runtime";
import { AuthService } from "./auth/service.js";
import type { AuthConfig } from "./auth/config.js";
import type { AppConfig } from "./config/config.js";
import { AppError } from "./errors.js";
import { SourceRepositoryService } from "./repositories/sourceRepository.js";
import { SourceService } from "./services/sourceService.js";
import { SearchService } from "./services/searchService.js";
import { ImageProxyService } from "./services/imageProxy.js";
import { DownloadService } from "./services/downloads/downloadService.js";
import { DownloadRepository } from "./services/downloads/downloadRepository.js";
import { DownloadRunner } from "./services/downloads/downloadRunner.js";
import { ImageCache } from "./storage/imageCache.js";
import { createPaths } from "./storage/paths.js";
import { createHttpClient } from "./utils/fetch.js";
import { ensureDir } from "./utils/fs.js";

export function createApplication(
  config: AppConfig,
  authConfig: AuthConfig,
  onError: (error: unknown) => void,
) {
  const paths = createPaths(config.dataDir);
  const http = createHttpClient(config);
  let storage: ReturnType<typeof createStorage>;
  try {
    storage = createStorage(config.dataDir);
  } catch (error) {
    void http.close().catch(onError);
    throw error;
  }
  const auth = new AuthService(storage, authConfig);
  const repository = new SourceRepositoryService(config, paths, http.fetch);
  const sources = new SourceService(new PluginManager(config), repository, storage);
  const search = new SearchService(sources);
  const imageProxy = new ImageProxyService(
    sources,
    new ImageCache(paths.imageCache, config.imageCacheMaxBytes),
  );
  const downloadRepository = new DownloadRepository(storage);
  const downloads = new DownloadService(
    downloadRepository,
    new DownloadRunner(sources, imageProxy, downloadRepository, {
      outputDir: paths.downloads,
      concurrency: config.downloadConcurrency,
      retries: config.downloadRetries,
      prefetchChapter: config.pluginSourceConcurrency > 1,
    }),
    config.downloadTaskConcurrency,
    onError,
  );
  let initialization: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  return {
    config,
    paths,
    repository,
    sources,
    search,
    imageProxy,
    downloads,
    storage,
    auth,
    initialize() {
      if (closing) return Promise.reject(new AppError("APP_CLOSING", "Service is closing"));
      return (initialization ??= (async () => {
        await Promise.all(
          [paths.scripts, paths.sourceData, paths.imageCache, paths.downloads].map(ensureDir),
        );
        await sources.loadInstalled();
        await downloads.init();
      })());
    },
    close() {
      return (closing ??= (async () => {
        await initialization?.catch(() => undefined);
        try {
          await downloads.close();
        } finally {
          try {
            await sources.close();
          } finally {
            try {
              await http.close();
            } finally {
              storage.close();
            }
          }
        }
      })());
    },
  };
}
export type Application = ReturnType<typeof createApplication>;
