import type { DownloadTask } from "../../types.js";
import { Icon, type IconName } from "../../app/Icon.js";

type DownloadSummaryProps = { downloads: DownloadTask[] };

export function DownloadSummary({ downloads }: DownloadSummaryProps) {
  const stats: { label: string; value: number; icon: IconName; detail: string }[] = [
    {
      label: "正在下载",
      value: downloads.filter((task) => task.status === "running").length,
      icon: "download",
      detail: "服务器后台处理",
    },
    {
      label: "等待队列",
      value: downloads.filter((task) => task.status === "queued").length,
      icon: "clock",
      detail: "等待空闲下载位",
    },
    {
      label: "已完成",
      value: downloads.filter((task) => task.status === "completed").length,
      icon: "check",
      detail: "可下载到本机",
    },
    {
      label: "失败任务",
      value: downloads.filter((task) => task.status === "failed").length,
      icon: "list",
      detail: `共 ${downloads.length} 个任务`,
    },
  ];
  return (
    <div className="download-summary">
      {stats.map((stat) => (
        <div className="download-stat" key={stat.label}>
          <span className="summary-icon">
            <Icon name={stat.icon} size={21} />
          </span>
          <div>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
