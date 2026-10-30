import { useEffect, useRef, useState } from "react";
import { LoadingStatus } from "./LoadingStatus.js";

type AsyncImageProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  retryable?: boolean;
  animate?: boolean;
};

export function AsyncImage(props: AsyncImageProps) {
  return <ImageState key={props.src} {...props} />;
}

function ImageState(props: AsyncImageProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const src = attempt
    ? `${props.src}${props.src.includes("?") ? "&" : "?"}_retry=${attempt}`
    : props.src;
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setStatus("ready");
  }, [attempt]);
  return (
    <span
      className={`async-image ${props.className ?? ""}`}
      data-state={status}
      aria-busy={status === "loading"}
    >
      <img
        key={src}
        ref={image}
        src={src}
        alt={props.alt}
        loading={props.loading ?? "lazy"}
        decoding="async"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
      {status === "loading" && (
        <span className="image-placeholder" aria-hidden={!props.alt}>
          {props.animate ? <LoadingStatus label="图片加载中…" /> : "图片加载中…"}
        </span>
      )}
      {status === "error" && (
        <span className="image-placeholder">
          <span>图片加载失败</span>
          {props.retryable && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStatus("loading");
                setAttempt((current) => current + 1);
              }}
            >
              重新加载图片
            </button>
          )}
        </span>
      )}
    </span>
  );
}
