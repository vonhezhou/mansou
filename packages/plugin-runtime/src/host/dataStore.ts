import type { StorageDatabase } from "@mansou/storage";

type PluginStorage = Pick<
  StorageDatabase,
  | "getSourceSettings"
  | "setSourceSettings"
  | "clearSourceSettings"
  | "getPluginData"
  | "setPluginData"
  | "deletePluginData"
>;

/** Venera's synchronous data API backed by the host's persistent storage. */
export class SourceDataStore {
  constructor(
    private readonly storage: PluginStorage,
    private readonly scope?: string,
  ) {}
  loadSync(sourceKey: string, key: string) {
    sourceKey = this.scope ?? sourceKey;
    return key === "settings"
      ? this.storage.getSourceSettings(sourceKey)
      : this.storage.getPluginData(sourceKey, key);
  }
  saveSync(sourceKey: string, key: string, value: unknown) {
    sourceKey = this.scope ?? sourceKey;
    if (key === "settings")
      this.storage.setSourceSettings(sourceKey, value as Record<string, unknown>);
    else this.storage.setPluginData(sourceKey, key, value);
  }
  deleteSync(sourceKey: string, key: string) {
    sourceKey = this.scope ?? sourceKey;
    if (key === "settings") this.storage.clearSourceSettings(sourceKey);
    else this.storage.deletePluginData(sourceKey, key);
  }
  async load(sourceKey: string, key: string) {
    return this.loadSync(sourceKey, key);
  }
  async save(sourceKey: string, key: string, value: unknown) {
    this.saveSync(sourceKey, key, value);
  }
  async delete(sourceKey: string, key: string) {
    this.deleteSync(sourceKey, key);
  }
}
