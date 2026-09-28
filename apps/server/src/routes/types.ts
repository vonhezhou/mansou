import type { AuthService } from "../auth/service.js";
import type { DownloadService } from "../services/downloadService.js";
import type { ImageProxyService } from "../services/imageProxy.js";
import type { SourceRepositoryService } from "../services/sourceRepository.js";
import type { SourceRuntime } from "../runtime/sourceRuntime.js";
import type { StorageDatabase } from "@venera/storage";

export type RouteContext = {
  auth: AuthService;
  repository: SourceRepositoryService;
  runtime: SourceRuntime;
  imageProxy: ImageProxyService;
  downloads: DownloadService;
  storage: StorageDatabase;
};
