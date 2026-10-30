import type { SourceRegistry } from "@venera/core";
import { ImageCache } from "../storage/imageCache.js";
type ImageProxyInput = {
  sourceKey: string;
  comicId?: string;
  episodeId?: string | null;
  imageKey: string;
  thumbnail?: boolean;
};
type ImageResult = { data: Buffer; contentType: string; cached: boolean };

export class ImageProxyService {
  private readonly pending = new Map<string, Promise<ImageResult>>();

  constructor(
    private readonly sources: SourceRegistry,
    private readonly cache: ImageCache,
  ) {}

  async load(input: ImageProxyInput) {
    return this.loadBytes(input, true);
  }

  async loadBytes(input: ImageProxyInput, useCache = true) {
    if (input.imageKey.startsWith("mock://")) {
      const data = Buffer.from(mockSvg(input.imageKey));
      return { data, contentType: "image/svg+xml; charset=utf-8", cached: false };
    }

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
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = this.fetchBytes(cacheInput, true);
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      // 仅合并进行中的请求，失败不留存，后续调用仍可重新加载。
      this.pending.delete(key);
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
    if (useCache) await this.cache.write(input, data);
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

function mockSvg(label: string) {
  const safeLabel = label.replace(
    /[<>&]/g,
    (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]!,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#bg)"/>
  <circle cx="740" cy="180" r="90" fill="#64748b" opacity="0.35"/>
  <text x="450" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" fill="#f8fafc">Venera Web</text>
  <text x="450" y="640" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#cbd5e1">${safeLabel}</text>
</svg>`;
}
