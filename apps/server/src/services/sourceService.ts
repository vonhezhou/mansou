import path from "node:path";
import { AppError } from "../errors.js";
import type {
  SourceRegistry,
  SourceProvider,
  SourceMetadata,
  ImageInput,
  LoginInput,
} from "@mansou/core";
import type { StorageDatabase } from "@mansou/storage";
import { PluginManager } from "@mansou/plugin-runtime";
import { SourceRepositoryService } from "../repositories/sourceRepository.js";

/** Application workflows; no Venera objects or executor details enter this service. */
export class SourceService implements SourceRegistry {
  private pending: Promise<unknown> = Promise.resolve();
  private closing = false;
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
    return this.mutate(() => this.loadSourceScript(filePath));
  }
  private async loadSourceScript(filePath: string) {
    const loaded = await this.manager.load(filePath);
    const existing = this.storage.getSource(loaded.key);
    this.storage.upsertSource({
      key: loaded.key,
      name: loaded.name,
      version: loaded.version,
      scriptPath: filePath,
      scriptUrl: existing?.script_url ?? undefined,
      hash: existing?.hash ?? undefined,
    });
    return loaded;
  }
  loadInstalled() {
    return (this.reloadPromise ??= this.mutate(() => this.reload()).finally(() => {
      this.reloadPromise = undefined;
    }));
  }
  private async reload() {
    const scripts = await this.repository.listInstalledScripts();
    await this.manager.close();
    const loaded: Array<SourceMetadata & { filePath: string }> = [];
    for (const filePath of scripts) {
      const metadata =
        this.storage.listSources().find((source) => source.script_path === filePath) ??
        this.storage.getSource(path.basename(filePath, ".js"));
      if (metadata?.enabled === 0) continue;
      try {
        loaded.push(await this.loadSourceScript(filePath));
      } catch {
        /* Manager records load errors for the diagnostics endpoint. */
      }
    }
    return loaded;
  }
  install(source: string) {
    return this.mutate(() => this.installSource(source));
  }
  private async installSource(source: string) {
    let loaded!: SourceMetadata & { filePath: string };
    const installed = await this.repository.installSource(
      source,
      async (filePath) => {
        loaded = await this.manager.load(filePath);
      },
      this.storage.getSource(source)?.script_url,
    );
    this.storage.upsertSource({
      key: loaded.key,
      name: loaded.name,
      version: loaded.version,
      scriptPath: installed.filePath,
      scriptUrl: installed.scriptUrl,
      hash: installed.hash,
      enabled: true,
    });
    const metadata = this.storage.getSource(loaded.key);
    if (metadata?.enabled === 0) await this.manager.unload(loaded.key);
    return { installed, loaded: { key: loaded.key, name: loaded.name, version: loaded.version } };
  }
  setEnabled(key: string, enabled: boolean) {
    return this.mutate(async () => {
      const source = this.storage.getSource(key);
      if (!source) return null;
      if (enabled) {
        if (!this.manager.list().some((loaded) => loaded.key === key)) {
          const scripts = await this.repository.listInstalledScripts();
          const filePath =
            scripts.find((file) => file === source.script_path) ??
            scripts.find((file) => path.basename(file, ".js") === key);
          if (!filePath)
            throw new AppError("SOURCE_NOT_FOUND", "Installed source script not found");
          await this.manager.load(filePath);
        }
      } else await this.manager.unload(key);
      return this.storage.setSourceEnabled(key, enabled);
    });
  }
  uninstall(key: string) {
    return this.mutate(async () => {
      const source = this.storage.getSource(key);
      if (!source) throw new AppError("SOURCE_NOT_FOUND", "漫画源不存在");
      if (
        this.storage
          .listDownloads()
          .some(
            (task) =>
              task.sourceKey === key && (task.status === "queued" || task.status === "running"),
          )
      )
        throw new AppError("DOWNLOAD_BUSY", "请先暂停或取消该源的下载任务，再卸载");
      await this.repository.removeScript(source.script_path);
      await this.manager.unload(key);
      this.storage.deleteSource(key);
      return { ok: true };
    });
  }
  metadata() {
    return this.repository.withAvailableUpdates(
      this.storage.listSources().map((source) => ({
        ...source,
        canUninstall: this.repository.canUninstall(source.script_path),
      })),
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
  respondToDialog(key: string, id: string, buttonIndex: number | null) {
    return this.get(key).respondToDialog(id, buttonIndex);
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
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new AppError("APP_CLOSING", "Service is closing"));
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
  async close() {
    this.closing = true;
    await this.pending;
    await this.manager.close();
  }
}
