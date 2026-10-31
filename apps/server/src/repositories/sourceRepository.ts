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

export class SourceRepositoryService {
  constructor(
    private readonly config: Pick<AppConfig, "sourceListUrl" | "sourceCdnBaseUrl">,
    private readonly paths: AppPaths,
    private readonly fetch: typeof globalThis.fetch,
  ) {}
  get url() {
    return this.config.sourceListUrl;
  }

  async refreshRepository() {
    const response = await this.fetch(this.config.sourceListUrl, {
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
    await writeJson(this.paths.repositoryIndex, list);
    return list;
  }

  async getAvailableSources() {
    return readJson<RepositorySource[]>(this.paths.repositoryIndex, []);
  }

  async withAvailableUpdates<
    T extends { key: string; script_url?: string | null; version?: string | null },
  >(installed: T[]) {
    const list = await this.getAvailableSources();
    return installed.map((source) => {
      const candidate = this.findSourceByKey(list, source.key, source.script_url);
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
    const list = await this.refreshRepository();

    const item =
      list.find(
        (source) => source.filename === sourceKeyOrName || source.fileName === sourceKeyOrName,
      ) ??
      this.findSourceByKey(list, sourceKeyOrName, installedScriptUrl) ??
      list.find((source) => source.name === sourceKeyOrName);
    if (!item) {
      throw new Error(`Source not found in repository: ${sourceKeyOrName}`);
    }

    const scriptUrl = this.resolveScriptUrl(item);
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

  private findSourceByKey(list: RepositorySource[], key: string, scriptUrl?: string | null) {
    const candidates = list.filter((item) => item.key === key);
    if (scriptUrl) {
      try {
        const filename = path.posix.basename(new URL(scriptUrl).pathname);
        const variant = candidates.find((item) => {
          try {
            return path.posix.basename(new URL(this.resolveScriptUrl(item)).pathname) === filename;
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

  private resolveScriptUrl(item: RepositorySource) {
    if (item.url) return new URL(item.url, this.config.sourceListUrl).toString();
    const filename = item.filename ?? item.fileName;
    if (!filename) {
      throw new Error(`Source has neither url nor filename: ${item.name}`);
    }
    return new URL(filename, this.config.sourceCdnBaseUrl || this.config.sourceListUrl).toString();
  }

  private resolveScriptFileName(item: RepositorySource) {
    const raw = item.key ?? item.filename ?? item.fileName ?? item.name;
    const base = safeFilename(path.basename(raw));
    return base.endsWith(".js") ? base : `${base}.js`;
  }
}
