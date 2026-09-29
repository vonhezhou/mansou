import path from "node:path";
import type {
  SourceRegistry,
  SourceProvider,
  SourceMetadata,
  ImageInput,
  LoginInput,
} from "@venera/core";
import type { StorageDatabase } from "@venera/storage";
import { PluginManager } from "@venera/plugin-runtime";
import { SourceRepositoryService } from "../repositories/sourceRepository.js";

/** Application workflows; no Venera objects or executor details enter this service. */
export class SourceService implements SourceRegistry {
  private reloadPromise?: Promise<Array<SourceMetadata & { filePath: string }>>;
  constructor(
    private readonly manager: PluginManager,
    private readonly repository: SourceRepositoryService,
    private readonly storage: StorageDatabase,
  ) {}
  get(key: string): SourceProvider {
    return this.manager.get(key);
  }
  list() {
    return this.manager.list();
  }
  all() {
    return this.manager.listInstalled().map((source) => ({
      ...source,
      enabled: true,
      hasSearch: source.capabilities.search,
      hasComic: source.capabilities.details,
    }));
  }
  loadScript(filePath: string) {
    return this.manager.load(filePath);
  }
  loadInstalled() {
    return (this.reloadPromise ??= this.reload().finally(() => {
      this.reloadPromise = undefined;
    }));
  }
  private async reload() {
    const scripts = await this.repository.listInstalledScripts();
    await this.manager.close();
    const loaded: Array<SourceMetadata & { filePath: string }> = [];
    for (const filePath of scripts) {
      const metadata = this.storage.getSource(path.basename(filePath, ".js")) as {
        enabled?: number;
      } | null;
      if (metadata?.enabled === 0) continue;
      try {
        loaded.push(await this.loadScript(filePath));
      } catch {
        /* Manager records load errors for the diagnostics endpoint. */
      }
    }
    return loaded;
  }
  async install(source: string) {
    let loaded!: SourceMetadata & { filePath: string };
    const installed = await this.repository.installSource(source, async (filePath) => {
      loaded = await this.loadScript(filePath);
    });
    this.storage.upsertSource({
      key: loaded.key,
      name: loaded.name,
      version: loaded.version,
      scriptPath: installed.filePath,
      scriptUrl: installed.scriptUrl,
      hash: installed.hash,
      enabled: true,
    });
    const metadata = this.storage.getSource(loaded.key) as { enabled?: number } | null;
    if (metadata?.enabled === 0) await this.loadInstalled();
    return { installed, loaded: { key: loaded.key, name: loaded.name, version: loaded.version } };
  }
  async setEnabled(key: string, enabled: boolean) {
    const source = this.storage.setSourceEnabled(key, enabled);
    if (source) await this.loadInstalled();
    return source;
  }
  metadata() {
    return this.repository.withAvailableUpdates(
      this.storage.listSources() as Array<{ key: string; version?: string }>,
    );
  }
  searchOptions(key: string) {
    this.get(key);
    return this.list().find((source) => source.key === key)!.searchOptions;
  }
  comicDetails(key: string, id: string) {
    return this.get(key).comicDetails(id);
  }
  comicPages(key: string, id: string, episode?: string | null) {
    return this.get(key).comicPages(id, episode);
  }
  async loadImageBytes(key: string, input: ImageInput) {
    const result = await this.get(key).loadImageBytes(input);
    return { ...result, data: Buffer.from(result.data) };
  }
  sourceSettings(key: string) {
    return this.get(key).settings();
  }
  updateSourceSettings(key: string, values: Record<string, unknown>) {
    return this.get(key).updateSettings(values);
  }
  clearSourceSettings(key: string) {
    return this.get(key).resetSettings();
  }
  invokeSetting(key: string, setting: string) {
    return this.get(key).invokeSetting(setting);
  }
  auth(key: string) {
    return this.get(key).auth();
  }
  login(key: string, input: LoginInput) {
    return this.get(key).login(input);
  }
  logout(key: string) {
    return this.get(key).logout();
  }
  cookies(key: string) {
    return this.get(key).cookies();
  }
  importCookies(
    key: string,
    url: string,
    values: Array<string | Record<string, unknown>> | string,
  ) {
    return this.get(key).importCookies(url, values);
  }
  clearCookies(key: string) {
    return this.get(key).clearCookies();
  }
  diagnostics() {
    return this.manager.diagnostics();
  }
  close() {
    return this.manager.close();
  }
}
