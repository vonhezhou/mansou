import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { paths } from "../storage/paths.js";
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
        return { data, contentType: this.detectContentType(data), cached: true };
      } catch {
        // cache miss
      }
    }

    const loadedSource = this.runtime.find(input.sourceKey).instance;
    let config: Record<string, unknown> = {};
    if (input.thumbnail) {
      config = loadedSource.getThumbnailLoadingConfig?.(input.imageKey) ?? {};
    } else {
      const loader = loadedSource.comic?.getImageLoadingConfig ?? loadedSource.getImageLoadingConfig;
      config = (await loader?.(input.imageKey, input.comicId ?? "", input.episodeId ?? null)) ?? {};
    }

    const requestUrl = String(config.url ?? input.imageKey);
    const response = await fetchWithProxy(requestUrl.startsWith("//") ? `https:${requestUrl}` : requestUrl, {
      method: String(config.method ?? "GET"),
      headers: (config.headers as Record<string, string> | undefined) ?? {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
      body: config.data == null ? undefined : String(config.data),
    });
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (useCache) {
      await ensureDir(path.dirname(cachePath));
      await writeFile(cachePath, data);
    }
    return {
      data,
      contentType: response.headers.get("content-type") ?? this.detectContentType(data),
      cached: false,
    };
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
