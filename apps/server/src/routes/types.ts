import type { AuthService } from "../auth/service.js";
import type { DownloadService } from "../services/downloads/downloadService.js";
import type { ImageProxyService } from "../services/imageProxy.js";
import type { SourceRepositoryService } from "../repositories/sourceRepository.js";
import type { SourceService } from "../services/sourceService.js";
import type { SearchService } from "../services/searchService.js";
import type { StorageDatabase } from "@venera/storage";

export type RouteContext = {
  auth: AuthService;
  repository: SourceRepositoryService;
  sources: SourceService;
  search: SearchService;
  imageProxy: ImageProxyService;
  downloads: DownloadService;
  storage: StorageDatabase;
};
