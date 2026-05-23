import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { StorageDatabase } from "@venera/storage";
import { paths } from "../storage/paths.js";
import { readJson, safeFilename, writeJson } from "../utils/fs.js";

export class SourceDataStore {
  constructor(private readonly storage?: StorageDatabase) {}

  loadSync(sourceKey: string, dataKey: string) {
    if (dataKey === "settings") return this.storage?.getSourceSettings(sourceKey) ?? this.readSourceDataSync(sourceKey)[dataKey];
    if (this.storage) return this.storage.getPluginData(sourceKey, dataKey);
    const data = this.readSourceDataSync(sourceKey);
    return data[dataKey];
  }

  saveSync(sourceKey: string, dataKey: string, value: unknown) {
    if (dataKey === "settings" && this.storage) {
      this.storage.setSourceSettings(sourceKey, value as Record<string, unknown>);
      return;
    }
    if (this.storage) {
      this.storage.setPluginData(sourceKey, dataKey, value);
      return;
    }
    const data = this.readSourceDataSync(sourceKey);
    data[dataKey] = value;
    this.writeSourceDataSync(sourceKey, data);
  }

  deleteSync(sourceKey: string, dataKey: string) {
    if (dataKey === "settings" && this.storage) {
      this.storage.clearSourceSettings(sourceKey);
      return;
    }
    if (this.storage) {
      this.storage.deletePluginData(sourceKey, dataKey);
      return;
    }
    const data = this.readSourceDataSync(sourceKey);
    delete data[dataKey];
    this.writeSourceDataSync(sourceKey, data);
  }

  async load(sourceKey: string, dataKey: string) {
    if (this.storage) return this.loadSync(sourceKey, dataKey);
    const data = await this.readSourceData(sourceKey);
    return data[dataKey];
  }

  async save(sourceKey: string, dataKey: string, value: unknown) {
    if (this.storage) {
      this.saveSync(sourceKey, dataKey, value);
      return;
    }
    const data = await this.readSourceData(sourceKey);
    data[dataKey] = value;
    await writeJson(this.filePath(sourceKey), data);
  }

  async delete(sourceKey: string, dataKey: string) {
    if (this.storage) {
      this.deleteSync(sourceKey, dataKey);
      return;
    }
    const data = await this.readSourceData(sourceKey);
    delete data[dataKey];
    await writeJson(this.filePath(sourceKey), data);
  }

  private async readSourceData(sourceKey: string) {
    return readJson<Record<string, unknown>>(this.filePath(sourceKey), {});
  }

  private filePath(sourceKey: string) {
    return path.join(paths.sourceData, `${safeFilename(sourceKey)}.json`);
  }

  private readSourceDataSync(sourceKey: string) {
    const file = this.filePath(sourceKey);
    if (!existsSync(file)) return {};
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private writeSourceDataSync(sourceKey: string, data: Record<string, unknown>) {
    const file = this.filePath(sourceKey);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}
