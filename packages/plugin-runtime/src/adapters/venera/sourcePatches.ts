import { PluginRuntimeError } from "../../errors.js";
import type { RuntimeOptions } from "../../options.js";
export function thumbnailToImageUrl(url: string) {
  const imageUrl = url.replace(/\/([0-9]+)t\.([^/.]+)(?:\.webp)?$/, "/$1.$2");
  return imageUrl.replace("//t3.nhentai.net/", "//i3.nhentai.net/");
}

export async function loadBaoziPages(
  comicId: string,
  episodeId: string,
  config: RuntimeOptions,
  fetch: typeof globalThis.fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const directUrl = `https://cn.bzmgcn.com/user/page_direct?comic_id=${encodeURIComponent(
    comicId,
  )}&section_slot=0&chapter_slot=${encodeURIComponent(episodeId)}`;
  try {
    const response = await fetch(directUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        referer: "https://cn.bzmgcn.com/",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const location = response.headers.get("location");
    const pageUrl = location ? new URL(location, directUrl).toString() : directUrl;
    const pageResponse = await fetch(pageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        referer: "https://cn.bzmgcn.com/",
      },
      signal: controller.signal,
    });
    if (!pageResponse.ok) return [];
    const html = await pageResponse.text();
    return [...html.matchAll(/data-src=["']([^"']+)["']/g)].map((match) => match[1]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadComickPages(
  comicId: string,
  episodeId: string,
  config: RuntimeOptions,
  fetch: typeof globalThis.fetch,
) {
  const [slug] = comicId.split("//");
  const [hid, type, chapter, lang] = episodeId.split("//");
  if (!slug || !hid || !type || !chapter || !lang) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const suffix = type === "no" ? hid : `${hid}-${type}-${chapter}-${lang}`;
    const response = await fetch(`https://comick.art/comic/${encodeURIComponent(slug)}/${suffix}`, {
      headers: { "user-agent": "Mozilla/5.0", referer: "https://comick.art/" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const html = await response.text();
    const match = html.match(/<script[^>]+id=["']sv-data["'][^>]*>([\s\S]*?)<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const images = data?.chapter?.images;
    return Array.isArray(images)
      ? images.map((image) => String(image?.url ?? "")).filter(Boolean)
      : [];
  } finally {
    clearTimeout(timeout);
  }
}

// 拷贝的 210 同时用于多种业务错误，只识别已确认的客户端访问限制。
export function checkSourceAccess(sourceKey: string, status: number, body: string) {
  if (sourceKey !== "copy_manga" || status !== 210) return;
  let message: unknown;
  try {
    message = JSON.parse(body).message;
  } catch {
    return;
  }
  if (typeof message === "string" && /正版|最新APP/i.test(message)) {
    throw new PluginRuntimeError(
      "SOURCE_ACCESS_RESTRICTED",
      "拷贝漫画上游限制了当前访问。请按官方提示更新正版客户端，并等待约 1 小时后再试。",
      sourceKey,
    );
  }
}
