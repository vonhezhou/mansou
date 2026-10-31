import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { NovelTask } from "../../api/novels.js";
import type { DownloadSnapshotStore } from "../../lib/downloadSnapshot.js";
import { PageTabs } from "../../app/PageTabs.js";
import { DownloadSummary } from "./DownloadSummary.js";
import { NovelDownloads } from "../novels/NovelDownloads.js";

const tabs = [
  { key: "all", label: "全部任务" },
  { key: "comics", label: "漫画" },
  { key: "novels", label: "小说" },
] as const;
export function DownloadsWorkspace({
  comicStore,
  novelStore,
  novelError,
  reloadNovels,
  children,
}: {
  comicStore: DownloadSnapshotStore;
  novelStore: DownloadSnapshotStore<NovelTask>;
  novelError?: string;
  reloadNovels: () => Promise<void>;
  children: ReactNode;
}) {
  const comics = useSyncExternalStore(comicStore.subscribe, comicStore.getSnapshot);
  const novels = useSyncExternalStore(novelStore.subscribe, novelStore.getSnapshot);
  const [filter, setFilter] = useState<"all" | "comics" | "novels">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const id = useId();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const tasks =
    filter === "comics" ? comics : filter === "novels" ? novels : [...comics, ...novels];
  return (
    <section className="inner-page downloads">
      <header className="page-title">
        <div>
          <span className="eyebrow">DOWNLOAD MANAGER</span>
          <h1>下载任务</h1>
          <p>统一管理漫画与小说下载，完成后获取 CBZ 或 TXT 文件。</p>
        </div>
      </header>
      <DownloadSummary downloads={tasks} />
      <PageTabs id={id} label="下载任务类型" tabs={tabs} value={filter} onChange={setFilter} />
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${id}-${tab.key}-panel`}
          aria-labelledby={`${id}-${tab.key}-tab`}
          hidden={filter !== tab.key}
        >
          {filter === tab.key && (
            <>
              {filter !== "novels" && (
                <section aria-label="漫画下载任务">
                  <h2>漫画下载</h2>
                  {children}
                </section>
              )}
              {filter !== "comics" && (
                <section className="novel-downloads-section" aria-label="小说下载">
                  <h2>小说下载</h2>
                  {(error || novelError) && (
                    <p className="alert" role="alert">
                      小说下载状态：{error ?? novelError}
                    </p>
                  )}
                  <NovelDownloads tasks={novels} busy={busy} run={run} reload={reloadNovels} />
                </section>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
