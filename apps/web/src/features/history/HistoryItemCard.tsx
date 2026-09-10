import {
  getHistoryComicId,
  getHistoryEpisodeId,
  getHistoryKey,
  getHistorySourceKey,
} from "../../lib/history.js";
import type { HistoryItem } from "../../types.js";

type HistoryItemCardProps = {
  item: HistoryItem;
  onOpenHistoryItem: (item: HistoryItem, mode: "details" | "read") => void;
};

export function HistoryItemCard(props: HistoryItemCardProps) {
  return (
    <article className="history-item" key={getHistoryKey(props.item)}>
      <div>
        <strong>{getHistoryComicId(props.item)}</strong>
        <span className="muted">
          {getHistorySourceKey(props.item)} / {getHistoryEpisodeId(props.item) || "未记录章节"} / 第{" "}
          {(props.item.page ?? 0) + 1} 页
        </span>
      </div>
      <div className="actions">
        <button onClick={() => props.onOpenHistoryItem(props.item, "details")}>查看详情</button>
        <button onClick={() => props.onOpenHistoryItem(props.item, "read")}>预览章节</button>
      </div>
    </article>
  );
}
