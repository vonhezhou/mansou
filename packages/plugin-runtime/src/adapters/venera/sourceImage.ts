import { types } from "node:util";
import type { VeneraComicSource } from "./types.js";
import type { RuntimeOptions } from "../../options.js";

import { modifyImageWithScript } from "./pluginImage.js";

export type SourceImageInput = {
  imageKey: string;
  comicId?: string;
  episodeId?: string | null;
  thumbnail?: boolean;
};
type LoadingConfig = Record<string, unknown> & {
  onResponse?: (data: ArrayBuffer) => unknown;
  onLoadFailed?: () => unknown;
  modifyImage?: string;
};

function loadingConfig(value: unknown): LoadingConfig {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid image loading config");
  return value as LoadingConfig;
}

function imageBytes(value: unknown): Buffer<ArrayBuffer> {
  if (types.isAnyArrayBuffer(value)) return Buffer.from(new Uint8Array(value));
  if (ArrayBuffer.isView(value))
    return Buffer.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (Array.isArray(value)) return Buffer.from(value);
  throw new Error("Invalid onResponse result: expected image bytes");
}

async function fetchImage(
  imageKey: string,
  options: LoadingConfig,
  config: RuntimeOptions,
  fetchWithProxy: typeof fetch,
) {
  const url = String(options.url ?? imageKey);
  const parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error(`Unsupported image protocol: ${parsed.protocol}`);
  const data = options.data;
  const body =
    data == null
      ? undefined
      : typeof data === "string"
        ? data
        : types.isAnyArrayBuffer(data) || ArrayBuffer.isView(data) || Array.isArray(data)
          ? imageBytes(data)
          : JSON.stringify(data);
  return fetchWithProxy(parsed.href, {
    method: String(options.method ?? "GET"),
    headers: (options.headers as Record<string, string> | undefined) ?? {
      "user-agent": "Mozilla/5.0",
    },
    body,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
}

async function readBytes(response: Response, config: RuntimeOptions) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
  }
  if (Number(response.headers.get("content-length") ?? 0) > config.maxImageBytes) {
    await response.body?.cancel();
    throw new Error("Image response is too large");
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > config.maxImageBytes) throw new Error("Image response is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

// Keep callbacks local to this request and this Worker’s VM context; never serialize closures.
export async function loadSourceImage(
  source: VeneraComicSource,
  input: SourceImageInput,
  globals: Record<string, unknown>,
  config: RuntimeOptions,
  fetchWithProxy: typeof fetch,
) {
  const { imageKey, comicId = "", episodeId = null, thumbnail = false } = input;
  const owner =
    !thumbnail && (source.comic?.getImageLoadingConfig || source.comic?.onImageLoad)
      ? source.comic
      : source;
  const loader = thumbnail
    ? source.getThumbnailLoadingConfig
    : (source.comic?.getImageLoadingConfig ??
      source.comic?.onImageLoad ??
      source.getImageLoadingConfig);
  let options = loadingConfig(await loader?.call(owner, imageKey, comicId, episodeId));
  for (let attempt = 0; ; attempt++) {
    try {
      let response = await fetchImage(imageKey, options, config, fetchWithProxy);
      // Preserve the pre-existing Web extension, without confusing it with Flutter's byte hook.
      const legacyResponse = source.comic?.onResponse ?? source.onResponse;
      if (!response.ok && attempt === 0 && legacyResponse) {
        const retry = loadingConfig(
          await legacyResponse.call(source.comic ?? source, imageKey, comicId, episodeId, {
            status: response.status,
            headers: Object.fromEntries(response.headers),
            url: response.url,
          }),
        );
        if (Object.keys(retry).length) {
          await response.body?.cancel();
          options = { ...options, ...retry };
          response = await fetchImage(imageKey, options, config, fetchWithProxy);
        }
      }
      let data = await readBytes(response, config);
      if (options.onResponse)
        data = imageBytes(await options.onResponse(Uint8Array.from(data).buffer));
      let contentType = response.headers.get("content-type") ?? "application/octet-stream";
      if (options.modifyImage != null) {
        if (typeof options.modifyImage !== "string")
          throw new Error("modifyImage must be a script string");
        data = await modifyImageWithScript(data, options.modifyImage, globals, config);
        contentType = "image/png";
      } else {
        const legacyModify = source.comic?.modifyImage ?? source.modifyImage;
        const modified = await legacyModify?.call(
          source.comic ?? source,
          imageKey,
          comicId,
          episodeId,
          data,
        );
        if (modified != null)
          data = imageBytes(
            typeof modified === "object" && "data" in modified ? modified.data : modified,
          );
      }
      if (data.length > config.maxImageBytes) throw new Error("Image response is too large");
      return { data, contentType };
    } catch (error) {
      if (attempt >= 1) throw error;
      const legacyFailure = source.comic?.onLoadFailed ?? source.onLoadFailed;
      const retry = options.onLoadFailed
        ? await options.onLoadFailed()
        : await legacyFailure?.call(
            source.comic ?? source,
            imageKey,
            comicId,
            episodeId,
            error instanceof Error ? error : new Error(String(error)),
          );
      if (retry == null || !Object.keys(loadingConfig(retry)).length) throw error;
      options = loadingConfig(retry);
    }
  }
}
