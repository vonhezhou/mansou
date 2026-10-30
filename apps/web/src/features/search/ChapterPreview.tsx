import { AsyncImage } from "../../app/AsyncImage.js";
import { imageUrl } from "../../api/mansou.js";
import type { Details } from "../../types.js";

type ChapterPreviewProps = {
  detailSourceKey: string;
  details: Details | null;
  episodeId: string | null;
  previewImages: string[];
};

export function ChapterPreview(props: ChapterPreviewProps) {
  return (
    <section className="panel chapter-preview">
      <h2>内容缩略预览</h2>
      {props.previewImages.length === 0 ? (
        <p className="muted">选择章节后点击预览。</p>
      ) : (
        <>
          <p className="muted">
            当前章节共 {props.previewImages.length} 页，展示前{" "}
            {Math.min(8, props.previewImages.length)} 页缩略图。
          </p>
          <div className="page-thumbnails">
            {props.previewImages.slice(0, 8).map((image, index) => (
              <figure key={`${image}-${index}`}>
                <AsyncImage
                  className="preview-image"
                  retryable
                  animate
                  src={imageUrl(
                    props.detailSourceKey,
                    image,
                    props.details?.comicId ?? props.details?.id,
                    props.episodeId ?? undefined,
                  )}
                  alt={`第 ${index + 1} 页`}
                  loading={index < 4 ? "eager" : "lazy"}
                />
                <figcaption>第 {index + 1} 页</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
