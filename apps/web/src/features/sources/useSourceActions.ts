import { useEffect, useRef, useState } from "react";
import { mansouApi } from "../../api/mansou.js";
import type { SourceSettingsActionResult, SourceUiEvent } from "../../types.js";

type SourceDialog = Extract<SourceUiEvent, { type: "dialog" }>;

export function useSourceActions(
  sourceKey: string,
  onResult: (result: SourceSettingsActionResult) => void,
) {
  const active = useRef(true);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pendingDialogs = useRef(new Set<string>());
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [dialogs, setDialogs] = useState<SourceDialog[]>([]);

  function discard(id: string) {
    void mansouApi.respondToSourceDialog(sourceKey, id, null).catch(() => {});
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      for (const id of pendingDialogs.current) discard(id);
      pendingDialogs.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!busy && dialogs.length === 0 && returnFocus.current) {
      const trigger = returnFocus.current;
      returnFocus.current = null;
      if (trigger.isConnected) trigger.focus();
    }
  }, [busy, dialogs.length]);

  async function run(action: () => Promise<SourceSettingsActionResult>, feedback: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (!active.current) {
        for (const event of result.events) if (event.type === "dialog") discard(event.id);
        return;
      }
      onResult(result);
      const incomingDialogs = result.events.filter(
        (event): event is SourceDialog => event.type === "dialog",
      );
      for (const dialog of incomingDialogs) pendingDialogs.current.add(dialog.id);
      setDialogs((current) => [...current, ...incomingDialogs]);
      const notices = result.events.flatMap((event) =>
        event.type === "message" ? [event.message] : [],
      );
      setMessages(notices.length ? notices : incomingDialogs.length ? [] : [feedback]);
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  function invoke(key: string, trigger: HTMLElement) {
    if (inFlight.current || pendingDialogs.current.size) return;
    returnFocus.current = trigger;
    setMessages([]);
    return run(() => mansouApi.invokeSourceSetting(sourceKey, key), "源操作已完成。");
  }

  function respond(buttonIndex: number | null) {
    if (inFlight.current || !dialogs[0]) return;
    const dialog = dialogs[0];
    pendingDialogs.current.delete(dialog.id);
    setDialogs((current) => current.slice(1));
    return run(
      () => mansouApi.respondToSourceDialog(sourceKey, dialog.id, buttonIndex),
      buttonIndex === null || /^(取消|cancel)$/i.test(dialog.buttons[buttonIndex].trim())
        ? "已取消操作。"
        : "所选操作已执行。",
    );
  }

  return { busy, error, messages, dialog: dialogs[0], invoke, respond };
}
