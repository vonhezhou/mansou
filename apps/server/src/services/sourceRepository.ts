import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import { config } from "../config/config.js";
import { paths } from "../storage/paths.js";
import type { RepositorySource } from "../types/source.js";
import { ensureDir, readJson, safeFilename, writeJson } from "../utils/fs.js";
import { fetchWithProxy } from "../utils/fetch.js";

export class SourceRepositoryService {
  async refreshRepository() {
    const response = await fetchWithProxy(config.sourceListUrl, {
      headers: { "user-agent": "venera-web-poc", "accept-encoding": "identity" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch source index: ${response.status} ${response.statusText}`);
    }
    const list = (await response.json()) as RepositorySource[];
    await writeJson(paths.repositoryIndex, list);
    return list;
  }

  async getAvailableSources() {
    return readJson<RepositorySource[]>(paths.repositoryIndex, []);
  }

  async installSource(sourceKeyOrName: string) {
    let list = await this.getAvailableSources();
    if (list.length === 0) {
      list = await this.refreshRepository();
    }

    const item = list.find(
      (source) =>
        source.key === sourceKeyOrName ||
        source.name === sourceKeyOrName ||
        source.filename === sourceKeyOrName ||
        source.fileName === sourceKeyOrName,
    );
    if (!item) {
      throw new Error(`Source not found in repository: ${sourceKeyOrName}`);
    }

    const scriptUrl = this.resolveScriptUrl(item);
    const response = await fetchWithProxy(scriptUrl, {
      headers: { "user-agent": "venera-web-poc", "accept-encoding": "identity" },
    });
    if (!response.ok) {
      throw new Error(`Failed to download source script: ${response.status} ${response.statusText}`);
    }

    const script = await response.text();
    if (!script.includes("extends ComicSource")) {
      throw new Error(`Downloaded source script is invalid: ${scriptUrl}`);
    }
    await ensureDir(paths.scripts);
    const fileName = this.resolveScriptFileName(item);
    const filePath = path.join(paths.scripts, fileName);
    await writeFile(filePath, script, "utf8");
    return { ...item, scriptUrl, filePath, hash: crypto.createHash("sha256").update(script).digest("hex") };
  }

  async listInstalledScripts() {
    await ensureDir(paths.scripts);
    const files = await readdir(paths.scripts);
    const installed = files.filter((file) => file.endsWith(".js")).map((file) => path.join(paths.scripts, file));
    if (!installed.some((file) => path.basename(file) === "mock.js") && existsSync(paths.bundledMockSource)) {
      installed.push(paths.bundledMockSource);
    }
    return installed;
  }

  async readScript(filePath: string) {
    return readFile(filePath, "utf8");
  }

  private resolveScriptUrl(item: RepositorySource) {
    if (item.url) return item.url;
    const filename = item.filename ?? item.fileName;
    if (!filename) {
      throw new Error(`Source has neither url nor filename: ${item.name}`);
    }
    return new URL(filename, config.sourceCdnBaseUrl).toString();
  }

  private resolveScriptFileName(item: RepositorySource) {
    const raw = item.key ?? item.filename ?? item.fileName ?? item.name;
    const base = safeFilename(path.basename(raw));
    return base.endsWith(".js") ? base : `${base}.js`;
  }
}
