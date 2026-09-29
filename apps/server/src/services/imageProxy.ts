import type { SourceRegistry } from "@venera/core";
import { ImageCache } from "../storage/imageCache.js";
type ImageProxyInput = {
  sourceKey: string;
  comicId?: string;
  episodeId?: string | null;
  imageKey: string;
  thumbnail?: boolean;
};

export class ImageProxyService {
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

    if (useCache) {
      const data = await this.cache.read(input);
      if (data) return { data, contentType: this.detectContentType(data), cached: true };
    }
    const result = await this.sources.get(input.sourceKey).loadImageBytes(input);
    const data = Buffer.from(result.data);
    const contentType = result.contentType;
    if (useCache) await this.cache.write(input, data);
    return {
      data,
      contentType:
        this.detectContentType(data) === "application/octet-stream"
          ? contentType
          : this.detectContentType(data),
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
