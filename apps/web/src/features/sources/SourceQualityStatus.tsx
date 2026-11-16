import { useState } from "react";
import type { components } from "@mansou/contracts";
import { isSourcePreferred, preferSource } from "../../lib/sourceInterest.js";

type Quality = components["schemas"]["SourceQuality"];
const labels = {
  observing: "待观察",
  normal: "正常",
  preferred: "优先",
  degraded: "已降级",
  isolated: "冷却中",
};
const operations = {
  search: "搜索",
  details: "详情",
  catalog: "目录",
  content: "内容获取",
  download: "下载任务",
};
const reasons = {
  timeout: "超时",
  network: "连接失败",
  limited: "请求限流",
  restricted: "登录或访问受限",
  parse: "解析失败",
  source: "源执行失败",
};
export function SourceQualityStatus({
  quality,
  kind,
  sourceKey,
}: {
  quality?: Quality;
  kind: "comic" | "novel";
  sourceKey: string;
}) {
  const [preferred, setPreferred] = useState(() => isSourcePreferred(kind, sourceKey));
  return (
    <details className="source-health">
      <summary>
        搜索质量 · {labels[quality?.state ?? "observing"]} · {quality?.score ?? 50} 分
      </summary>
      <div className="source-health-evidence">
        <p className="muted">
          最近 7 天按小时汇总，近期记录权重更高。低样本先观察，冷却期满后恢复试搜。
        </p>
        {quality?.cooldownUntil && (
          <p>
            冷却至 {new Date(quality.cooldownUntil).toLocaleString("zh-CN")}
            ，可在搜索中勾选“包含隔离源重试”。
          </p>
        )}
        {!quality?.operations.length && <p>暂无有效调用记录，使用后自动积累。</p>}
        {quality?.operations.map((item) => (
          <div className="source-health-operation" key={item.operation}>
            <strong>
              {operations[item.operation]} · {labels[item.state]} · {item.score} 分
            </strong>
            <p>
              成功 {item.successCount} 次 / 失败 {item.failureCount} 次 / 连续失败{" "}
              {item.consecutiveFailures} 次
            </p>
            {item.successCount > 0 && (
              <p>
                成功请求平均 {item.meanMs} ms · P95 ≤ {item.p95Ms} ms
              </p>
            )}
            {item.lastError && (
              <p>
                上次异常为{reasons[item.lastError]}，发生于{" "}
                {new Date(item.lastFailureAt!).toLocaleString("zh-CN")}
              </p>
            )}
          </div>
        ))}
        <label className="novel-checkbox">
          <input
            type="checkbox"
            checked={preferred}
            onChange={(event) => {
              const value = event.target.checked;
              preferSource(kind, sourceKey, value);
              setPreferred(value);
            }}
          />
          本浏览器优先
        </label>
        {quality && (
          <p className="muted">评估时间 {new Date(quality.checkedAt).toLocaleString("zh-CN")}</p>
        )}
      </div>
    </details>
  );
}
