import type { SourceRegistry } from "@mansou/core";
import { ImageCache } from "../storage/imageCache.js";
type ImageProxyInput = {
  sourceKey: string;
  comicId?: string;
  episodeId?: string | null;
  imageKey: string;
  thumbnail?: boolean;
};
type ImageResult = { data: Buffer; contentType: string; cached: boolean };
type CachePolicy = boolean | "read-only";
type PendingImage = {
  request: Promise<ImageResult>;
  cacheWrite?: Promise<void>;
  users: number;
};

export class ImageProxyService {
  private readonly pending = new Map<string, PendingImage>();

  constructor(
    private readonly sources: SourceRegistry,
    private readonly cache: ImageCache,
  ) {}

  async load(input: ImageProxyInput) {
    return this.loadBytes(input, true);
  }

  async loadBytes(input: ImageProxyInput, useCache: CachePolicy = true) {
    if (!useCache) return this.fetchBytes(input, false);
    // 固定字段顺序，使预览与下载共享进行中的请求及磁盘缓存。
    const cacheInput: ImageProxyInput = {
      sourceKey: input.sourceKey,
      comicId: input.comicId,
      episodeId: input.episodeId,
      imageKey: input.imageKey,
      thumbnail: input.thumbnail,
    };
    const key = JSON.stringify(cacheInput);
    let pending = this.pending.get(key);
    if (!pending) {
      pending = { request: this.fetchBytes(cacheInput, true), users: 0 };
      this.pending.set(key, pending);
    }
    pending.users++;
    try {
      const result = await pending.request;
      // 下载只复用已有缓存；预览仍按需写入，混合请求也只写一次。
      if (useCache === true && !result.cached)
        await (pending.cacheWrite ??= this.cache.write(cacheInput, result.data));
      return result;
    } finally {
      // 缓存写入尚未完成时继续合并请求，所有调用退出后释放字节和失败结果。
      if (--pending.users === 0) this.pending.delete(key);
    }
  }

  private async fetchBytes(input: ImageProxyInput, useCache: boolean): Promise<ImageResult> {
    if (useCache) {
      const data = await this.cache.read(input);
      if (data) return { data, contentType: this.detectContentType(data), cached: true };
    }
    const result = await this.sources.get(input.sourceKey).loadImageBytes(input);
    const data = Buffer.from(result.data);
    const contentType = this.detectContentType(data);
    return {
      data,
      contentType: contentType === "application/octet-stream" ? result.contentType : contentType,
      cached: false,
    };
  }

  cacheStats() {
    return this.cache.cacheStats();
  }
  enforceCacheLimit() {
    return this.cache.enforceCacheLimit();
  }
  clearCache() {
    return this.cache.clearCache();
  }

  private detectContentType(data: Uint8Array) {
    if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
      return "image/png";
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46)
      return "image/webp";
    return "application/octet-stream";
  }
}
