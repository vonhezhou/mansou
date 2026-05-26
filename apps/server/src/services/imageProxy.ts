import crypto from "node:crypto";
import path from "node:path";
import { readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { paths } from "../storage/paths.js";
import { config } from "../config/config.js";
import { ensureDir } from "../utils/fs.js";
import { SourceRuntime } from "../runtime/sourceRuntime.js";
import { fetchWithProxy } from "../utils/fetch.js";

type ImageProxyInput = {
  sourceKey: string;
  comicId?: string;
  episodeId?: string | null;
  imageKey: string;
  thumbnail?: boolean;
};

export class ImageProxyService {
  constructor(private readonly runtime: SourceRuntime) {}

  async load(input: ImageProxyInput) {
    return this.loadBytes(input, true);
  }

  async loadBytes(input: ImageProxyInput, useCache = true) {
    if (input.imageKey.startsWith("mock://")) {
      const data = Buffer.from(mockSvg(input.imageKey));
      return { data, contentType: "image/svg+xml; charset=utf-8", cached: false };
    }

    const cachePath = this.cachePath(input);
    if (useCache) {
      try {
        const data = await readFile(cachePath);
        const now = new Date();
        await utimes(cachePath, now, now).catch(() => undefined);
        return { data, contentType: this.detectContentType(data), cached: true };
      } catch {
        // cache miss
      }
    }

    let loadingConfig = await this.runtime.imageLoadingConfig(
      input.sourceKey,
      input.imageKey,
      input.comicId ?? "",
      input.episodeId ?? null,
      input.thumbnail,
    );

    let response: Response;
    try {
      response = await this.fetchImage(String(loadingConfig.url ?? input.imageKey), loadingConfig);
    } catch (error) {
      const fallback = await this.runtime.imageLoadFailed(input.sourceKey, input.imageKey, input.comicId ?? "", input.episodeId ?? null, error instanceof Error ? error : new Error(String(error)));
      if (!Object.keys(fallback).length) throw error;
      loadingConfig = { ...loadingConfig, ...fallback };
      response = await this.fetchImage(String(loadingConfig.url ?? input.imageKey), loadingConfig);
    }

    const responseConfig = await this.runtime.imageResponse(input.sourceKey, input.imageKey, input.comicId ?? "", input.episodeId ?? null, {
      status: response.status,
      headers: normalizeHeaders(response.headers),
      url: response.url,
    });
    if (!response.ok && Object.keys(responseConfig).length) {
      loadingConfig = { ...loadingConfig, ...responseConfig };
      response = await this.fetchImage(String(loadingConfig.url ?? input.imageKey), loadingConfig);
    }
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > config.maxImageBytes) throw new Error("Image response is too large");

    let data: Buffer = Buffer.from(await response.arrayBuffer());
    data = await this.runtime.modifyImage(input.sourceKey, input.imageKey, input.comicId ?? "", input.episodeId ?? null, data);
    if (data.length > config.maxImageBytes) throw new Error("Image response is too large");
    if (useCache) {
      await ensureDir(path.dirname(cachePath));
      await writeFile(cachePath, data);
      await this.enforceCacheLimit();
    }
    return {
      data,
      contentType: response.headers.get("content-type") ?? this.detectContentType(data),
      cached: false,
    };
  }

  async cacheStats() {
    const files = await listFiles(paths.imageCache);
    let bytes = 0;
    for (const file of files) bytes += (await stat(file)).size;
    return { files: files.length, bytes };
  }

  async enforceCacheLimit() {
    const maxBytes = config.imageCacheMaxBytes;
    if (maxBytes <= 0) return this.cacheStats();
    const files = await listFiles(paths.imageCache);
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
    await rm(paths.imageCache, { recursive: true, force: true });
    await ensureDir(paths.imageCache);
    return this.cacheStats();
  }

  private cachePath(input: ImageProxyInput) {
    const hash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return path.join(paths.imageCache, `${hash}.bin`);
  }

  private detectContentType(data: Uint8Array) {
    if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return "image/webp";
    return "application/octet-stream";
  }

  private async fetchImage(requestUrl: string, loadingConfig: Record<string, unknown>) {
    const normalizedUrl = requestUrl.startsWith("//") ? `https:${requestUrl}` : requestUrl;
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(`Unsupported image protocol: ${parsedUrl.protocol}`);
    }
    return fetchWithProxy(normalizedUrl, {
      method: String(loadingConfig.method ?? "GET"),
      headers: (loadingConfig.headers as Record<string, string> | undefined) ?? {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
      body: loadingConfig.data == null ? undefined : String(loadingConfig.data),
    });
  }
}

function normalizeHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
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

function mockSvg(label: string) {
  const safeLabel = label.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]!);
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
