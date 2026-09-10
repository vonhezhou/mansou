type ChapterSelectorProps = {
  chapters: Record<string, string>;
  episodeId: string | null;
  selectedEpisodeIds: string[];
  episodePageCounts: Record<string, number>;
  onPreviewEpisode: (episodeId?: string | null) => void;
  onToggleSelectedEpisode: (episodeId: string) => void;
  onSelectEpisodes: (action: "all" | "clear" | "invert") => void;
};

export function ChapterSelector(props: ChapterSelectorProps) {
  return (
    <>
      <div className="selection-actions">
        <button onClick={() => props.onSelectEpisodes("all")}>全选</button>
        <button onClick={() => props.onSelectEpisodes("clear")}>清空</button>
        <button onClick={() => props.onSelectEpisodes("invert")}>反选</button>
        <span className="muted">已选 {props.selectedEpisodeIds.length} 章</span>
      </div>
      <div className="chips">
        {Object.entries(props.chapters).map(([id, title]) => (
          <span className="chapter-chip" key={id}>
            <label>
              <input
                checked={props.selectedEpisodeIds.includes(id)}
                onChange={() => props.onToggleSelectedEpisode(id)}
                type="checkbox"
              />{" "}
              {title}
            </label>
            {props.episodePageCounts[id] !== undefined && (
              <small>{props.episodePageCounts[id]} 页</small>
            )}
            <button
              className={id === props.episodeId ? "active" : ""}
              onClick={() => props.onPreviewEpisode(id)}
            >
              预览
            </button>
          </span>
        ))}
      </div>
    </>
  );
}
