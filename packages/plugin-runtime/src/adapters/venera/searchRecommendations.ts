import type { SearchRecommendationGroup } from "@mansou/core";
import type { VeneraComicSource } from "./types.js";

type Part = NonNullable<NonNullable<VeneraComicSource["category"]>["parts"]>[number];
type Item = SearchRecommendationGroup["items"][number];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function searchItem(value: unknown, part: Part): Item | undefined {
  let label: unknown;
  let page: unknown;
  let attributes: Record<string, unknown> | undefined;
  if (typeof value === "string") {
    label = value;
    page = part.itemType;
    attributes = { keyword: value };
  } else {
    const item = record(value);
    label = item?.label;
    const target = item?.target;
    if (typeof target === "string") {
      const separator = target.indexOf(":");
      page = target.slice(0, separator);
      attributes = { text: target.slice(separator + 1) };
    } else {
      const data = record(target);
      page = data?.page ?? data?.action;
      attributes = data?.page ? record(data.attributes) : { keyword: data?.keyword };
    }
  }
  if (page !== "search" || typeof label !== "string" || !attributes) return;
  const keyword = attributes.keyword ?? attributes.text;
  // 首期只提供可跨源填写的普通搜索词，不丢弃专属选项后错误地发起搜索。
  if (
    typeof keyword !== "string" ||
    !keyword.trim() ||
    /[:：]/u.test(keyword) ||
    Object.keys(attributes).some((key) => key !== "keyword" && key !== "text")
  )
    return;
  return {
    label: label.trim() || keyword.trim(),
    keyword: keyword.trim(),
    target: { page: "search", attributes: { ...attributes } },
  };
}

function supported(part: Part) {
  return ["fixed", "random", "dynamic"].includes(part.type);
}

export function hasSearchRecommendations(source: VeneraComicSource) {
  return (source.category?.parts ?? []).some(
    (part) =>
      supported(part) &&
      ((part.type === "dynamic" && typeof part.loader === "function") ||
        (part.categories ?? []).some((item) => searchItem(item, part) !== undefined)),
  );
}

export async function loadSearchRecommendations(
  source: VeneraComicSource,
): Promise<SearchRecommendationGroup[]> {
  const groups: SearchRecommendationGroup[] = [];
  for (const [index, part] of (source.category?.parts ?? []).entries()) {
    if (!supported(part)) continue;
    const values =
      part.type === "dynamic" && !part.categories ? await part.loader?.() : part.categories;
    if (!Array.isArray(values)) {
      if (part.type === "dynamic") throw new Error("动态推荐词必须返回数组");
      continue;
    }
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const value of values) {
      const item = searchItem(value, part);
      if (!item || seen.has(item.keyword)) continue;
      seen.add(item.keyword);
      items.push({ ...item, label: source.translate?.(item.label) ?? item.label });
    }
    if (!items.length) continue;
    groups.push({
      id: String(index),
      title: source.translate?.(part.name) ?? part.name,
      random: part.type === "random",
      limit:
        part.type === "random" && Number.isInteger(part.randomNumber) && part.randomNumber! > 0
          ? Math.min(part.randomNumber!, 12)
          : 12,
      items,
    });
  }
  return groups;
}
