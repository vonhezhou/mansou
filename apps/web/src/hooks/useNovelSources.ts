import { useCallback, useEffect, useRef, useState } from "react";
import { novelApi, type NovelState } from "../api/novels.js";

export function useNovelSources() {
  const [state, setState] = useState<NovelState>({ sources: [], subscriptions: [] });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void run(async () => {
      const value = await novelApi.state(controller.signal);
      if (!controller.signal.aborted) setState(value);
    });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [run]);
  return { state, setState, busy, error, run };
}
