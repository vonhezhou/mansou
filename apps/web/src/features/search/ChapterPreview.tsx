import { imageUrl } from "../../api/venera.js";
import type { Details } from "../../types.js";

type ChapterPreviewProps = {
  detailSourceKey: string;
  details: Details | null;
  episodeId: string | null;
  previewImages: string[];
};

export function ChapterPreview(props: ChapterPreviewProps) {
  return <section className="panel chapter-preview">
    <h2>章节预览</h2>
    {props.previewImages.length === 0 ? <p className="muted">加载章节图片用于确认内容和源可用性，移动端按单列显示预览图片。</p> : props.previewImages.map((image, index) => <img id={`page-${index + 1}`} key={`${image}-${index}`} src={imageUrl(props.detailSourceKey, image, props.details?.comicId ?? props.details?.id, props.episodeId ?? undefined)} alt={`page ${index + 1}`} loading={index < 2 ? "eager" : "lazy"} />)}
  </section>;
}
