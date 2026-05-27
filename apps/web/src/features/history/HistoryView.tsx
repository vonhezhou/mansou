import type { HistoryItem } from "../../types.js";
import { HistoryItemCard } from "./HistoryItemCard.js";

type HistoryViewProps = {
  history: HistoryItem[];
  onOpenHistoryItem: (item: HistoryItem, mode: "details" | "read") => void;
};

export function HistoryView({ history, onOpenHistoryItem }: HistoryViewProps) {
  return <section className="panel history">
    <h2>最近记录</h2>
    {history.length === 0 ? <p className="muted">暂无历史记录，可以先去搜索漫画。</p> : history.map((item) => <HistoryItemCard item={item} key={`${item.sourceKey ?? item.source_key}:${item.comicId ?? item.comic_id}:${item.episodeId ?? item.episode_id}`} onOpenHistoryItem={onOpenHistoryItem} />)}
  </section>;
}
