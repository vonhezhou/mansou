import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStorage, type StorageDatabase } from "@venera/storage";
import { PluginManager } from "@venera/plugin-runtime";
import { config } from "../../src/config/config.js";
import { SourceService } from "../../src/services/sourceService.js";
import { SearchService } from "../../src/services/searchService.js";
import { SourceRepositoryService } from "../../src/repositories/sourceRepository.js";
export class TestSourceRuntime extends SourceService {
  private readonly searchService = new SearchService(this);
  private readonly db: StorageDatabase;
  constructor(storage?: StorageDatabase) {
    const dataDir = storage
      ? config.dataDir
      : mkdtempSync(path.join(os.tmpdir(), "venera-runtime-test-"));
    const db = storage ?? createStorage(dataDir);
    super(new PluginManager({ ...config, dataDir }), new SourceRepositoryService(), db);
    this.db = db;
  }
  search(...args: Parameters<SearchService["search"]>) {
    return this.searchService.search(...args);
  }
  async close() {
    await super.close();
    this.db.close();
  }
}
