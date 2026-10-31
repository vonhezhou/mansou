import { memo } from "react";
import { AsyncImage } from "../../app/AsyncImage.js";
import type { Comic } from "@mansou/contracts";
import { Icon } from "../../app/Icon.js";
import { imageUrl } from "../../api/mansou.js";

type ComicCardProps = {
  comic: Comic;
  sourceKey: string;
  sourceName?: string;
  onOpenComic: (comic: Comic, sourceKey?: string) => void;
  busy?: boolean;
};

// 编辑搜索条件或详情内章节时，未变化的结果卡片无需重新渲染。
export const ComicCard = memo(function ComicCard(props: ComicCardProps) {
  return (
    <button
      className="comic-card"
      disabled={props.busy}
      onClick={() => props.onOpenComic(props.comic, props.sourceKey)}
      aria-label={`查看 ${props.comic.title} 的详情`}
    >
      {props.comic.cover ? (
        <AsyncImage
          src={imageUrl(props.sourceKey, props.comic.cover, props.comic.id, undefined, true)}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="async-image" aria-hidden="true">
          <span className="image-placeholder">暂无封面</span>
        </span>
      )}
      <span className="comic-card-info">
        <span className="source-label">{props.sourceName ?? props.sourceKey}</span>
        <strong>{props.comic.title}</strong>
        {props.comic.subtitle && <span className="comic-subtitle">{props.comic.subtitle}</span>}
        <span className="comic-card-foot">
          查看章节与下载
          <Icon name="chevron" size={15} />
        </span>
      </span>
    </button>
  );
});
