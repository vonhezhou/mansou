import type { DownloadTask } from "../../types.js";

type DownloadSummaryProps = { downloads: DownloadTask[] };

export function DownloadSummary(props: DownloadSummaryProps) {
  const completed = props.downloads.filter((task) => task.status === "completed").length;
  const failed = props.downloads.filter((task) => task.status === "failed").length;
  const running = props.downloads.filter((task) => task.status === "running" || task.status === "queued").length;

  return <div className="download-summary"><span>全部任务 <strong>{props.downloads.length}</strong></span><span>进行中 <strong>{running}</strong></span><span>已完成 <strong>{completed}</strong></span><span>失败 <strong>{failed}</strong></span></div>;
}
