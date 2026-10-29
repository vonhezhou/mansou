import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { CacheStats } from "../../types.js";

type CachePanelProps = {
  cache: CacheStats | null;
  operation?: string | null;
  onPruneCache: () => void;
  onClearCache: () => void;
};

export function CachePanel(props: CachePanelProps) {
  if (!props.cache) return null;

  return (
    <section className="cache-panel">
      <div>
        <strong>图片缓存</strong>
        <span className="muted">
          {props.cache.files} 个文件，{(props.cache.bytes / 1024 / 1024).toFixed(2)} MB
        </span>
      </div>
      <p className="muted">仅清理临时图片缓存，不会删除已下载的漫画文件。</p>
      {props.operation && <LoadingStatus label={props.operation} />}
      <div className="actions">
        <button disabled={Boolean(props.operation)} onClick={props.onPruneCache}>
          按限制裁剪
        </button>
        <button disabled={Boolean(props.operation)} className="danger" onClick={props.onClearCache}>
          清理缓存
        </button>
      </div>
    </section>
  );
}
