import type { Comic } from "@mansou/core";
export function normalizeComic(raw: Record<string, unknown>, sourceKey: string): Comic {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    cover: String(raw.cover ?? ""),
    subtitle:
      typeof raw.subtitle === "string"
        ? raw.subtitle
        : typeof raw.subTitle === "string"
          ? raw.subTitle
          : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    description: typeof raw.description === "string" ? raw.description : "",
    sourceKey,
    maxPage: typeof raw.maxPage === "number" ? raw.maxPage : undefined,
    language: typeof raw.language === "string" ? raw.language : undefined,
    stars: typeof raw.stars === "number" ? raw.stars : undefined,
  };
}

export function normalizeValue(value: unknown): unknown {
  if (
    value instanceof Map ||
    (value &&
      typeof value === "object" &&
      typeof (value as { entries?: unknown }).entries === "function" &&
      typeof (value as { size?: unknown }).size === "number")
  ) {
    return Object.fromEntries(
      [...(value as { entries: () => Iterable<[unknown, unknown]> }).entries()].map(
        ([key, item]) => [String(key), normalizeValue(item)],
      ),
    );
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]),
    );
  }
  return value;
}

export function normalizeChapters(chapters: unknown): Record<string, string> | undefined {
  if (!chapters || typeof chapters !== "object" || Array.isArray(chapters)) return undefined;
  const flattened: Record<string, string> = {};
  for (const [key, value] of Object.entries(chapters as Record<string, unknown>)) {
    if (typeof value === "string") {
      flattened[key] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [episodeId, title] of Object.entries(value as Record<string, unknown>)) {
        if (typeof title === "string") flattened[episodeId] = title;
      }
    }
  }
  return Object.keys(flattened).length > 0 ? flattened : undefined;
}
