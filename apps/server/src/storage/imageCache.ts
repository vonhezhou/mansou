import crypto from "node:crypto";
import path from "node:path";
import { readdir, readFile, writeFile, rm, stat, utimes, mkdir } from "node:fs/promises";
export class ImageCache {
  constructor(
    private readonly directory: string,
    private readonly maxBytes: number,
  ) {}
  private file(key: unknown) {
    return path.join(
      this.directory,
      `${crypto.createHash("sha256").update(JSON.stringify(key)).digest("hex")}.bin`,
    );
  }
  async read(key: unknown) {
    try {
      const file = this.file(key);
      const data = await readFile(file);
      const now = new Date();
      await utimes(file, now, now).catch(() => undefined);
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async write(key: unknown, data: Uint8Array) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.file(key), data);
    await this.enforceCacheLimit();
  }
  async cacheStats() {
    const files = await listFiles(this.directory);
    let bytes = 0;
    for (const file of files) bytes += (await stat(file)).size;
    return { files: files.length, bytes };
  }

  async enforceCacheLimit() {
    const maxBytes = this.maxBytes;
    if (maxBytes <= 0) return this.cacheStats();
    const files = await listFiles(this.directory);
    const entries = await Promise.all(
      files.map(async (file) => {
        const info = await stat(file);
        return { file, size: info.size, atimeMs: info.atimeMs };
      }),
    );
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries.sort((a, b) => a.atimeMs - b.atimeMs)) {
      if (total <= maxBytes) break;
      await rm(entry.file, { force: true });
      total -= entry.size;
    }
    return this.cacheStats();
  }

  async clearCache() {
    await rm(this.directory, { recursive: true, force: true });
    await mkdir(this.directory, { recursive: true });
    return this.cacheStats();
  }
}
async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
      }),
    );
    return nested.flat();
  } catch {
    return [];
  }
}
