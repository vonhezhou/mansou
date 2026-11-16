import { DownloadDirectory } from "./services/downloadDirectory.js";
import { NovelEngineExecutor } from "./services/novels/engineExecutor.js";
import path from "node:path";
import { NovelSourceService } from "./services/novels/sourceService.js";
import { NovelDownloadService } from "./services/novels/downloadService.js";
import { createStorage } from "@mansou/storage";
import { PluginManager } from "@mansou/plugin-runtime";
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
import { SourceQualityService, type QualityOperation } from "./services/sourceQuality.js";
import { ZlibraryClient, ZLIBRARY_KEY } from "./sources/zlibrary/client.js";
import { ZlibraryProvider } from "./sources/zlibrary/provider.js";

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
  const quality = new SourceQualityService(storage.sourceQuality);
  const novelEngine = new NovelEngineExecutor(
    http.fetch,
    config.requestTimeoutMs,
    storage.novels,
    quality,
  );
  const zlibrary = new ZlibraryClient(
    http.fetch,
    novelEngine.sessions,
    () => storage.getSetting<{ domain: string }>(ZLIBRARY_KEY)?.domain ?? "https://zlib.bz",
  );
  const zlibraryProvider = new ZlibraryProvider(zlibrary, storage, http.fetch, quality);
  const comicOperations: Record<string, QualityOperation> = {
    search: "search",
    comicDetails: "details",
    comicPages: "catalog",
    loadImageBytes: "content",
  };
  const sources = new SourceService(
    new PluginManager(config, {
      loaded: (key, version) => quality.register("comic", key, version),
      completed: (key, version, operation, elapsedMs, result, errorCode) => {
        const tracked = comicOperations[operation];
        if (!tracked) return;
        quality.record("comic", key, version, {
          operation: tracked,
          elapsedMs,
          errorCode,
          nonempty:
            operation === "search" &&
            Boolean((result as { comics?: unknown[] } | undefined)?.comics?.length),
        });
      },
    }),
    repository,
    storage,
    quality,
    zlibraryProvider,
  );
  const search = new SearchService(sources, quality);
  const imageProxy = new ImageProxyService(
    sources,
    new ImageCache(paths.imageCache, config.imageCacheMaxBytes),
  );
  const downloadDirectory = new DownloadDirectory(storage, paths.downloads);
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
    (value, destination) => downloadDirectory.resolve(value, destination),
    quality,
    (value) => downloadDirectory.classify(value),
  );
  const novelSources = new NovelSourceService(
    storage.novels,
    http.fetch,
    config.requestTimeoutMs,
    novelEngine,
    quality,
    zlibrary,
  );
  const novelDownloads = new NovelDownloadService(
    storage.novels,
    novelSources,
    novelEngine,
    {
      outputDir: path.join(paths.downloads, "novels"),
      resolveDirectory: (value, destination) =>
        value
          ? downloadDirectory.resolve(value)
          : path.join(downloadDirectory.resolve(undefined, destination), "novels"),
      classifyDirectory: (value) => downloadDirectory.classify(value),
      concurrency: config.downloadTaskConcurrency,
      retries: config.downloadRetries,
      zlibrary,
    },
    onError,
    quality,
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
    downloadDirectory,
    novelSources,
    novelDownloads,
    novelEngine,
    storage,
    zlibrary,
    auth,
    quality,
    initialize() {
      if (closing) return Promise.reject(new AppError("APP_CLOSING", "Service is closing"));
      return (initialization ??= (async () => {
        await Promise.all(
          [paths.scripts, paths.sourceData, paths.imageCache, paths.downloads].map(ensureDir),
        );
        await sources.loadInstalled();
        await downloads.init();
        novelDownloads.init();
      })());
    },
    close() {
      return (closing ??= (async () => {
        zlibrary.close();
        await initialization?.catch(() => undefined);
        try {
          await Promise.all([downloads.close(), novelDownloads.close()]);
          await novelEngine.close();
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
