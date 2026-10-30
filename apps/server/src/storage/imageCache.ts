import crypto from "node:crypto";
import path from "node:path";
import { readdir, readFile, writeFile, rename, rm, stat, utimes, mkdir } from "node:fs/promises";

type CacheEntry = { size: number; atimeMs: number };

export class ImageCache {
  private entries?: Map<string, CacheEntry>;
  private bytes = 0;
  private pending: Promise<unknown> = Promise.resolve();

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
      const entry = this.entries?.get(file);
      if (entry) {
        this.entries!.delete(file);
        this.entries!.set(file, { ...entry, atimeMs: now.getTime() });
      }
      await utimes(file, now, now).catch(() => undefined);
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  write(key: unknown, data: Uint8Array) {
    return this.mutate(async () => {
      if (!this.entries) await this.scan();
      await mkdir(this.directory, { recursive: true });
      const file = this.file(key);
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temporary, data);
        // 读请求保持并行，原子替换避免同键写入时读取到半张图片。
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      const previous = this.entries!.get(file);
      this.bytes += data.byteLength - (previous?.size ?? 0);
      this.entries!.delete(file);
      this.entries!.set(file, { size: data.byteLength, atimeMs: Date.now() });
      await this.prune();
    });
  }

  cacheStats() {
    return this.mutate(async () => {
      // 显式统计重新核对磁盘，兼容外部清理；图片热路径只增量更新索引。
      await this.scan();
      return this.summary();
    });
  }

  enforceCacheLimit() {
    return this.mutate(async () => {
      await this.scan();
      await this.prune();
      return this.summary();
    });
  }

  clearCache() {
    return this.mutate(async () => {
      await rm(this.directory, { recursive: true, force: true });
      await mkdir(this.directory, { recursive: true });
      this.entries = new Map();
      this.bytes = 0;
      return this.summary();
    });
  }

  private async scan() {
    const entries: Array<[string, CacheEntry]> = [];
    const files = await listFiles(this.directory);
    let next = 0;
    const workers = Array.from({ length: Math.min(8, files.length) }, async () => {
      while (next < files.length) {
        const file = files[next++];
        if (/\.bin\.[\da-f-]+\.tmp$/.test(file)) {
          await rm(file, { force: true });
          continue;
        }
        try {
          const info = await stat(file);
          entries.push([file, { size: info.size, atimeMs: info.atimeMs }]);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    });
    // 维护仍在串行队列中，所有在途查询结束后才能替换索引或开始下一次清理。
    const results = await Promise.allSettled(workers);
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
    // Map 的顺序即淘汰顺序；读取和写入会将条目移到末尾。
    this.entries = new Map(entries.sort((a, b) => a[1].atimeMs - b[1].atimeMs));
    this.bytes = entries.reduce((total, [, entry]) => total + entry.size, 0);
  }

  private async prune() {
    if (this.maxBytes <= 0) return;
    while (this.bytes > this.maxBytes && this.entries!.size > 0) {
      const [file, entry] = this.entries!.entries().next().value!;
      await rm(file, { force: true });
      this.entries!.delete(file);
      this.bytes -= entry.size;
    }
  }

  private summary() {
    return { files: this.entries!.size, bytes: this.bytes };
  }

  private mutate<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task);
    this.pending = result.catch(() => {
      // I/O 失败后下次重新核对磁盘，不能沿用可能只更新了一半的统计。
      this.entries = undefined;
    });
    return result;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await listFiles(file)));
      else if (entry.isFile()) files.push(file);
    }
    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
