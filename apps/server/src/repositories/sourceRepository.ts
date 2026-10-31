import path from "node:path";
import { AppError } from "../errors.js";
import { isNewerVersion } from "@mansou/plugin-runtime/version";
import { readdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import type { AppConfig } from "../config/config.js";
import type { AppPaths } from "../storage/paths.js";
import type { RepositorySource } from "../types/source.js";
import { ensureDir, readJson, safeFilename, writeJson } from "../utils/fs.js";

type RepositoryState = { url: string; cdnBaseUrl: string; sources: RepositorySource[] };

export class SourceRepositoryService {
  // 按顺序保存和刷新，避免较早发起的刷新覆盖新订阅。
  private mutation = Promise.resolve();

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(task);
    this.mutation = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  constructor(
    private readonly config: Pick<AppConfig, "sourceListUrl" | "sourceCdnBaseUrl">,
    private readonly paths: AppPaths,
    private readonly fetch: typeof globalThis.fetch,
  ) {}
  async getRepository() {
    const saved = await readJson<RepositoryState | null>(this.paths.repositoryIndex, null);
    return saved &&
      typeof saved.url === "string" &&
      typeof saved.cdnBaseUrl === "string" &&
      Array.isArray(saved.sources)
      ? saved
      : { url: this.config.sourceListUrl, cdnBaseUrl: this.config.sourceCdnBaseUrl, sources: [] };
  }

  updateRepository(settings: { url: string; cdnBaseUrl: string }) {
    return this.serialize(() => this.saveRepository(settings));
  }

  private async saveRepository(settings: { url: string; cdnBaseUrl: string }) {
    const sources = await this.fetchSources(settings.url);
    const state = { url: settings.url, cdnBaseUrl: settings.cdnBaseUrl, sources };
    await ensureDir(path.dirname(this.paths.repositoryIndex));
    const staged = `${this.paths.repositoryIndex}.${crypto.randomUUID()}.tmp`;
    try {
      await writeJson(staged, state);
      await rename(staged, this.paths.repositoryIndex);
    } finally {
      await rm(staged, { force: true });
    }
    return state;
  }

  private refreshState() {
    return this.serialize(async () => this.saveRepository(await this.getRepository()));
  }

  async refreshRepository() {
    return (await this.refreshState()).sources;
  }

  private async fetchSources(url: string) {
    const response = await this.fetch(url, {
      headers: { "user-agent": "mansou", "accept-encoding": "identity" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch source index: ${response.status} ${response.statusText}`);
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid source index: expected an array");
    const list = payload.filter(
      (item): item is RepositorySource =>
        item &&
        typeof item === "object" &&
        typeof item.name === "string" &&
        typeof item.version === "string" &&
        (item.key == null || typeof item.key === "string") &&
        (item.url == null || typeof item.url === "string") &&
        (item.filename == null || typeof item.filename === "string") &&
        (item.fileName == null || typeof item.fileName === "string"),
    );
    if (payload.length && !list.length) throw new Error("订阅中没有有效的漫画源条目");
    return list;
  }

  async getAvailableSources() {
    return (await this.getRepository()).sources;
  }

  async withAvailableUpdates<
    T extends { key: string; script_url?: string | null; version?: string | null },
  >(installed: T[]) {
    const repository = await this.getRepository();
    const list = repository.sources;
    return installed.map((source) => {
      const candidate = this.findSourceByKey(list, source.key, source.script_url, repository);
      let availableVersion: string | undefined;
      try {
        if (candidate && isNewerVersion(candidate.version, source.version ?? "0.0.0")) {
          availableVersion = candidate.version;
        }
      } catch {
        /* A malformed version must not hide other installed sources. */
      }
      return { ...source, availableVersion };
    });
  }

  async installSource(
    sourceKeyOrName: string,
    activate?: (filePath: string) => Promise<void>,
    installedScriptUrl?: string | null,
  ) {
    const repository = await this.refreshState();
    const list = repository.sources;

    const item =
      list.find(
        (source) => source.filename === sourceKeyOrName || source.fileName === sourceKeyOrName,
      ) ??
      this.findSourceByKey(list, sourceKeyOrName, installedScriptUrl, repository) ??
      list.find((source) => source.name === sourceKeyOrName);
    if (!item) {
      throw new Error(`Source not found in repository: ${sourceKeyOrName}`);
    }

    const scriptUrl = this.resolveScriptUrl(item, repository);
    const response = await this.fetch(scriptUrl, {
      headers: { "user-agent": "mansou", "accept-encoding": "identity" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download source script: ${response.status} ${response.statusText}`,
      );
    }

    const script = await response.text();
    if (!script.includes("extends ComicSource")) {
      throw new Error(`Downloaded source script is invalid: ${scriptUrl}`);
    }
    await ensureDir(this.paths.scripts);
    const fileName = this.resolveScriptFileName(item);
    const filePath = path.join(this.paths.scripts, fileName);
    const previous = existsSync(filePath) ? await readFile(filePath) : undefined;
    const stagedPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(stagedPath, script, "utf8");
      await rename(stagedPath, filePath);
      try {
        await activate?.(filePath);
      } catch (error) {
        if (previous) {
          await writeFile(stagedPath, previous);
          await rename(stagedPath, filePath);
        } else await rm(filePath, { force: true });
        throw error;
      }
    } finally {
      await rm(stagedPath, { force: true });
    }
    return {
      ...item,
      scriptUrl,
      filePath,
      hash: crypto.createHash("sha256").update(script).digest("hex"),
    };
  }

  async listInstalledScripts() {
    await ensureDir(this.paths.scripts);
    const files = await readdir(this.paths.scripts);
    const installed = files
      .filter((file) => file.endsWith(".js"))
      .map((file) => path.join(this.paths.scripts, file));
    return installed;
  }

  canUninstall(filePath: string | null) {
    return !!filePath && path.dirname(path.resolve(filePath)) === path.resolve(this.paths.scripts);
  }

  async removeScript(filePath: string | null) {
    if (!this.canUninstall(filePath)) throw new AppError("SOURCE_BUILTIN", "内置源仅支持禁用");
    await rm(filePath!, { force: true });
  }

  async readScript(filePath: string) {
    return readFile(filePath, "utf8");
  }

  private findSourceByKey(
    list: RepositorySource[],
    key: string,
    scriptUrl: string | null | undefined,
    repository: RepositoryState,
  ) {
    const candidates = list.filter((item) => item.key === key);
    if (scriptUrl) {
      try {
        const filename = path.posix.basename(new URL(scriptUrl).pathname);
        const variant = candidates.find((item) => {
          try {
            return (
              path.posix.basename(new URL(this.resolveScriptUrl(item, repository)).pathname) ===
              filename
            );
          } catch {
            return false;
          }
        });
        if (variant) return variant;
      } catch {
        /* Older metadata may not contain a valid script URL. */
      }
    }
    return candidates[0];
  }

  private resolveScriptUrl(item: RepositorySource, repository: RepositoryState) {
    if (item.url) return new URL(item.url, repository.url).toString();
    const filename = item.filename ?? item.fileName;
    if (!filename) {
      throw new Error(`Source has neither url nor filename: ${item.name}`);
    }
    return new URL(filename, repository.cdnBaseUrl || repository.url).toString();
  }

  private resolveScriptFileName(item: RepositorySource) {
    const raw = item.key ?? item.filename ?? item.fileName ?? item.name;
    const base = safeFilename(path.basename(raw));
    return base.endsWith(".js") ? base : `${base}.js`;
  }
}
