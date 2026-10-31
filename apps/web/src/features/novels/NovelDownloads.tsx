import { novelApi, type NovelTask } from "../../api/novels.js";

type Props = {
  tasks: NovelTask[];
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
};
export function NovelDownloads({ tasks, busy, run, reload }: Props) {
  return (
    <section className="novel-stack" aria-label="小说下载任务">
      <p className="muted">
        任务在服务器执行。暂停或失败后可继续，已完成章节不会重复抓取。只有选定章节全部成功才提供
        TXT；完整目录不代表作品完结或站点无缺章。
      </p>
      {!tasks.length && <p>暂无小说下载任务。</p>}
      {[...tasks].reverse().map((task) => {
        const action = (value: "pause" | "resume" | "cancel" | "delete") =>
          void run(async () => {
            await novelApi.action(task.id, value);
            await reload();
          });
        return (
          <article className="novel-panel" key={task.id}>
            <h2>{task.name}</h2>
            <p className="muted">
              {task.author || "作者未知"} · {task.sourceName} ·{" "}
              {task.all ? "下载目录全部章节" : `从第 ${task.start} 项起下载 ${task.limit} 项`}
            </p>
            <p role="status">
              {task.phase} · {task.completed} / {task.total || "待解析"} 章{" "}
              {task.current && `· ${task.current}`}
            </p>
            {task.total > 0 && (
              <progress
                aria-label={`${task.name} 下载进度`}
                value={task.completed}
                max={task.total}
              />
            )}
            {task.error && <p className="alert">{task.error}</p>}
            <div className="novel-actions">
              {["queued", "running"].includes(task.status) && (
                <button disabled={busy} onClick={() => action("pause")}>
                  暂停
                </button>
              )}
              {["paused", "failed"].includes(task.status) && (
                <button disabled={busy} onClick={() => action("resume")}>
                  {task.status === "failed" ? "重试未完成章节" : "继续"}
                </button>
              )}
              {!["completed", "cancelled"].includes(task.status) && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => action("cancel")}
                >
                  取消
                </button>
              )}
              {task.status === "completed" && (
                <a className="button novel-export" href={novelApi.txtUrl(task.id)}>
                  下载 TXT
                </a>
              )}
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`删除“${task.name}”的任务及下载文件？`)) action("delete");
                }}
              >
                删除任务及文件
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
