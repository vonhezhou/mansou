import { useState } from "react";
import { AsyncImage } from "../../app/AsyncImage.js";
import { ChapterPreviewDialog } from "./ChapterPreviewDialog.js";
import { imageUrl } from "../../api/mansou.js";
import type { Details } from "../../types.js";

type ChapterPreviewProps = {
  detailSourceKey: string;
  details: Details | null;
  episodeId: string | null;
  previewImages: string[];
};

export function ChapterPreview(props: ChapterPreviewProps) {
  // 切换源、漫画或章节时重新建立预览状态，避免沿用上一章的放大页码。
  return (
    <PreviewContent
      key={JSON.stringify([
        props.detailSourceKey,
        props.details?.comicId ?? props.details?.id,
        props.episodeId,
        props.previewImages,
      ])}
      {...props}
    />
  );
}

function PreviewContent(props: ChapterPreviewProps) {
  const [activePage, setActivePage] = useState<number | null>(null);
  const images = props.previewImages
    .slice(0, 8)
    .map((image) =>
      imageUrl(
        props.detailSourceKey,
        image,
        props.details?.comicId ?? props.details?.id,
        props.episodeId ?? undefined,
      ),
    );
  return (
    <section className="panel chapter-preview">
      <h2>内容缩略预览</h2>
      {props.previewImages.length === 0 ? (
        <p className="muted">选择章节后点击预览。</p>
      ) : (
        <>
          <p className="muted">
            当前章节共 {props.previewImages.length} 页，预览前 {images.length}{" "}
            页。点击图片放大查看，感兴趣可下载完整章节。
          </p>
          <div className="page-thumbnails">
            {images.map((image, index) => (
              <figure key={`${image}-${index}`}>
                <button
                  type="button"
                  className="preview-thumbnail-button"
                  aria-label={`放大第 ${index + 1} 页`}
                  onClick={() => setActivePage(index)}
                >
                  <AsyncImage
                    className="preview-image"
                    animate
                    src={image}
                    alt={`第 ${index + 1} 页`}
                    loading={index < 4 ? "eager" : "lazy"}
                  />
                </button>
                <figcaption>第 {index + 1} 页</figcaption>
              </figure>
            ))}
          </div>
          {activePage !== null && (
            <ChapterPreviewDialog
              images={images}
              totalPages={props.previewImages.length}
              chapterTitle={props.details?.chapters?.[props.episodeId ?? ""]}
              activePage={activePage}
              onPageChange={setActivePage}
              onClose={() => setActivePage(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
