import { getHistoryComicId, getHistoryEpisodeId, getHistoryKey, getHistorySourceKey } from "../lib/history.js";
import type { HistoryItem } from "../types.js";

type HistoryViewProps = {
  history: HistoryItem[];
  onOpenHistoryItem: (item: HistoryItem, mode: "details" | "read") => void;
};

export function HistoryView({ history, onOpenHistoryItem }: HistoryViewProps) {
  return <section className="panel history">
    <h2>最近记录</h2>
    {history.length === 0 ? <p className="muted">暂无历史记录，可以先去搜索漫画。</p> : history.map((item) => <article className="history-item" key={getHistoryKey(item)}><div><strong>{getHistoryComicId(item)}</strong><span className="muted">{getHistorySourceKey(item)} / {getHistoryEpisodeId(item) || "未记录章节"} / 第 {(item.page ?? 0) + 1} 页</span></div><div className="actions"><button onClick={() => onOpenHistoryItem(item, "details")}>查看详情</button><button onClick={() => onOpenHistoryItem(item, "read")}>预览章节</button></div></article>)}
  </section>;
}
