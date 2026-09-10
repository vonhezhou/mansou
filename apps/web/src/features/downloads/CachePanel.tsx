import type { CacheStats } from "../../types.js";

type CachePanelProps = {
  cache: CacheStats | null;
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
      <div className="actions">
        <button onClick={props.onPruneCache}>按限制裁剪</button>
        <button className="danger" onClick={props.onClearCache}>
          清理缓存
        </button>
      </div>
    </section>
  );
}
