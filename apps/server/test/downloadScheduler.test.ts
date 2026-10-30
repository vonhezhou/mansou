import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { DownloadScheduler } from "../src/services/downloads/downloadScheduler.js";

it("does not query a saturated queue and resumes scheduling in order when a slot is released", async () => {
  const pending = ["first", "second"];
  const queued = vi.fn(() => [...pending]);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = vi.fn(async (id: string) => {
    pending.splice(pending.indexOf(id), 1);
    if (id === "first") await blocked;
  });
  const onError = vi.fn();
  const scheduler = new DownloadScheduler(1, queued, run, onError);
  try {
    scheduler.kick();
    await setImmediate();
    expect(run.mock.calls).toEqual([["first", expect.any(AbortSignal)]]);
    expect(queued).toHaveBeenCalledOnce();
    scheduler.kick();
    scheduler.kick();
    await setImmediate();
    expect(queued).toHaveBeenCalledOnce();
    release();
    await setImmediate();
    expect(run.mock.calls.map(([id]) => id)).toEqual(["first", "second"]);
    expect(onError).not.toHaveBeenCalled();
  } finally {
    release();
    await scheduler.close();
  }
});
