import { getHistoryComicId, getHistoryEpisodeId, getHistoryKey, getHistorySourceKey } from "../lib/history.js";
import type { HistoryItem } from "../types.js";

type HistoryViewProps = {
  history: HistoryItem[];
  onOpenHistoryItem: (item: HistoryItem) => void;
};

export function HistoryView({ history, onOpenHistoryItem }: HistoryViewProps) {
  return <section className="panel history">
    <h2>阅读历史</h2>
    {history.length === 0 ? <p className="muted">暂无历史记录。</p> : history.map((item) => <button className="history-item" key={getHistoryKey(item)} onClick={() => onOpenHistoryItem(item)}><strong>{getHistoryComicId(item)}</strong><span className="muted">{getHistorySourceKey(item)} / {getHistoryEpisodeId(item) || "未记录章节"} / 第 {(item.page ?? 0) + 1} 页</span></button>)}
  </section>;
}
