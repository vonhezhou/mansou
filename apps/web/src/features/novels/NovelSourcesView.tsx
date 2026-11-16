import { LoadingStatus } from "../../app/LoadingStatus.js";
import type { NovelSourcesState } from "../../hooks/useNovelSources.js";
import { NovelSources } from "./NovelSources.js";
import { useEffect } from "react";

export function NovelSourcesView({ sourceState }: { sourceState: NovelSourcesState }) {
  const { state, setState, busy, error, run, reload } = sourceState;
  useEffect(() => {
    const controller = new AbortController();
    void run(async () => {
      try {
        await reload(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    });
    return () => controller.abort();
  }, [run, reload]);
  return (
    <>
      {error && (
        <p className="alert novel-status" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <div className="novel-status">
          <LoadingStatus label="正在处理书源…" />
        </div>
      )}
      <NovelSources state={state} busy={busy} error={error} run={run} onChange={setState} />
    </>
  );
}
