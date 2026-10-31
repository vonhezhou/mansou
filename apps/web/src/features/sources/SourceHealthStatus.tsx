import type { SourceMetadata } from "../../types.js";
import { Icon } from "../../app/Icon.js";

type Health = NonNullable<SourceMetadata["health"]>;
const statusLabels: Record<Health["status"], string> = {
  unknown: "暂无判断",
  available: "近期可用",
  unstable: "近期异常",
  suspected_broken: "疑似失效",
  restricted: "访问受限",
};
const operationLabels = { search: "搜索", comicDetails: "详情", comicPages: "章节列表" };
const errorLabels: Record<string, string> = {
  PLUGIN_TIMEOUT: "请求超时，可能与网络或源响应有关。",
  PLUGIN_NETWORK_ERROR: "连接失败，请检查网络或代理。",
  PLUGIN_RATE_LIMITED: "请求过于频繁，请等待一段时间后重试。",
  PLUGIN_API_MISSING: "插件调用了暂不支持的功能，可尝试更新源。",
  PLUGIN_SOURCE_ERROR: "源执行出错，可稍后重试或更新源。",
  SOURCE_ACCESS_RESTRICTED: "访问受限，请检查 Cookie、登录状态或源配置。",
  SOURCE_LOGIN_FAILED: "登录验证失败，请检查账号或 Cookie。",
  IMAGE_REJECTED: "请求被拒绝或内容不可用，不能据此认定源损坏。",
};

function timestamp(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function SourceHealthStatus({ health }: { health?: SourceMetadata["health"] }) {
  const status = health?.status ?? "unknown";
  const affected = health?.operations.find((item) => item.status === status);
  return (
    <details className={`source-health source-health-${status}`}>
      <summary>
        <span className="muted">近期可用性（推测）</span>
        <span className="source-health-label">{statusLabels[status]}</span>
        {affected && affected.consecutiveFailures > 0 && (
          <span className="muted">
            {operationLabels[affected.operation]}连续失败 {affected.consecutiveFailures} 次
          </span>
        )}
        <Icon name="chevron" size={14} />
      </summary>
      <div className="source-health-evidence">
        <p className="muted">
          仅根据本次源加载后近 24 小时的使用记录推测，每项功能最多保留 50
          次。未检测的功能不代表可用；不会自动禁用源。
        </p>
        {status === "unknown" && (
          <p>暂无近期有效记录，使用后会自动积累；源重载或服务重启后重新记录。</p>
        )}
        {health?.operations.map((item) => (
          <div className="source-health-operation" key={item.operation}>
            <strong>
              {operationLabels[item.operation]} · {statusLabels[item.status]}
            </strong>
            <p>
              成功 {item.successCount} 次 / 失败 {item.failureCount} 次
            </p>
            <p>最近成功：{item.lastSuccessAt ? timestamp(item.lastSuccessAt) : "暂无记录"}</p>
            {item.lastFailureAt && (
              <>
                <p>最近失败：{timestamp(item.lastFailureAt)}</p>
                <p>
                  上次失败原因：
                  {errorLabels[item.lastErrorCode ?? ""] ?? "请求失败，原因尚不明确。"}
                </p>
              </>
            )}
          </div>
        ))}
        {status === "suspected_broken" && (
          <p>至少一项功能连续执行失败 ≥ 3 次，且跨度 ≥ 2 分钟；仍需结合具体原因确认。</p>
        )}
        {health && <p className="muted">状态更新于 {timestamp(health.checkedAt)}</p>}
      </div>
    </details>
  );
}
