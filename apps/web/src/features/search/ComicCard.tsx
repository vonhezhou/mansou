import type { Comic } from "@venera/contracts";
import { imageUrl } from "../../api/venera.js";

type ComicCardProps = {
  comic: Comic;
  sourceKey: string;
  sourceName?: string;
  onOpenComic: (comic: Comic, sourceKey?: string) => void;
  onDownloadComic: (comic: Comic, sourceKey?: string) => void;
};

export function ComicCard(props: ComicCardProps) {
  return (
    <article className="comic-card">
      <img
        src={imageUrl(
          props.sourceKey,
          props.comic.cover ?? "mock://cover/0",
          props.comic.id,
          undefined,
          true,
        )}
        alt=""
      />
      {props.sourceName && <span className="source-label">{props.sourceName}</span>}
      <strong>{props.comic.title}</strong>
      <span>{props.comic.description}</span>
      <div className="card-actions">
        <button onClick={() => props.onOpenComic(props.comic, props.sourceKey)}>详情</button>
        <button onClick={() => props.onDownloadComic(props.comic, props.sourceKey)}>
          保存全本到服务器
        </button>
      </div>
    </article>
  );
}
