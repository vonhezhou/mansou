import { config } from "../config/config.js";
import type { SourceDataStore } from "./dataStore.js";

type Settings = Record<string, Record<string, unknown>>;
const definitions = new WeakMap<object, Settings>();

// Snapshot before init: source scripts may replace schema entries with runtime values.
export function captureSettings(source: { settings?: unknown }) {
  const entries = Object.entries(source.settings ?? {}).filter(
    ([, value]) => value && typeof value === "object" && !Array.isArray(value),
  );
  definitions.set(source, JSON.parse(JSON.stringify(Object.fromEntries(entries))));
}

export function sourceSettingsSchema(source: object): Settings {
  return structuredClone(definitions.get(source) ?? {});
}

export function createComicSourceBase(dataStore: SourceDataStore) {
  return class ComicSource {
    static sources: Record<string, unknown> = {};
    key = "";
    settings?: Settings;
    translation: Record<string, Record<string, string>> = {};

    loadSetting(key: string) {
      const values = this.loadData("settings") as Record<string, unknown> | undefined;
      const value = values?.[key] ?? (definitions.get(this) ?? this.settings)?.[key]?.default;
      if (value == null) throw new Error(`Setting not found: ${key}`);
      return value;
    }

    loadData(key: string) {
      return this.key ? dataStore.loadSync(this.key, key) : undefined;
    }

    saveData(key: string, value: unknown) {
      if (this.key) dataStore.saveSync(this.key, key, value);
    }

    deleteData(key: string) {
      if (this.key) dataStore.deleteSync(this.key, key);
    }

    get isLogged() {
      return this.loadData("account") != null;
    }

    translate(key: string) {
      return this.translation[config.locale]?.[key] ?? key;
    }

    init() {}
  };
}
