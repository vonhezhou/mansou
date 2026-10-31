import { LoadingStatus } from "../../app/LoadingStatus.js";
import { useNovelSources } from "../../hooks/useNovelSources.js";
import { NovelSources } from "./NovelSources.js";

export function NovelSourcesView() {
  const { state, setState, busy, error, run } = useNovelSources();
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
