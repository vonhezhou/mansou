import { imageUrl } from "../../api/venera.js";
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
        <p className="muted">打开详情后会自动尝试获取首章页面；也可以在章节列表中切换预览。</p>
      ) : (
        <>
          <p className="muted">
            当前章节共 {props.previewImages.length} 页，展示前{" "}
            {Math.min(8, props.previewImages.length)} 页缩略图。
          </p>
          <div className="page-thumbnails">
            {props.previewImages.slice(0, 8).map((image, index) => (
              <figure key={`${image}-${index}`}>
                <img
                  id={`page-${index + 1}`}
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
