import type { Comic } from "@venera/contracts";
import { imageUrl } from "../../api/venera.js";

type ComicCardProps = {
  comic: Comic;
  sourceKey: string;
  sourceName?: string;
  onOpenComic: (comic: Comic, sourceKey?: string) => void;
  busy?: boolean;
};

export function ComicCard(props: ComicCardProps) {
  return (
    <button
      className="comic-card"
      disabled={props.busy}
      onClick={() => props.onOpenComic(props.comic, props.sourceKey)}
      aria-label={`查看 ${props.comic.title} 的详情`}
    >
      <img
        src={imageUrl(
          props.sourceKey,
          props.comic.cover ?? "mock://cover/0",
          props.comic.id,
          undefined,
          true,
        )}
        alt=""
        loading="lazy"
      />
      <strong>{props.comic.title}</strong>
      <span className="source-label">{props.sourceName ?? props.sourceKey}</span>
    </button>
  );
}
