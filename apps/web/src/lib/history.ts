import type { HistoryItem } from "../types.js";

export function getHistorySourceKey(item: HistoryItem) {
  return item.sourceKey ?? item.source_key ?? "";
}

export function getHistoryComicId(item: HistoryItem) {
  return item.comicId ?? item.comic_id ?? "";
}

export function getHistoryEpisodeId(item: HistoryItem) {
  return item.episodeId ?? item.episode_id ?? "";
}

export function getHistoryKey(item: HistoryItem) {
  return `${getHistorySourceKey(item)}:${getHistoryComicId(item)}`;
}
