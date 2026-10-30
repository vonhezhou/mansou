import { afterEach, expect, it, vi } from "vitest";
import { SourceUi } from "../src/adapters/venera/sourceUi.js";

afterEach(() => vi.useRealTimers());

it("requires an explicit choice and consumes each dialog only once", async () => {
  const ui = new SourceUi((text) => text);
  const apply = vi.fn();
  const events = await ui.capture(() =>
    ui.dialog("Confirm", "Change domains?", [{ text: "Apply", callback: apply }]),
  );
  const dialog = events[0];
  if (dialog.type !== "dialog") throw new Error("Expected dialog");
  expect(apply).not.toHaveBeenCalled();
  expect(() => ui.respond(dialog.id, 9)).toThrow("无效的源操作选项");
  await ui.respond(dialog.id, 0);
  expect(apply).toHaveBeenCalledOnce();
  expect(() => ui.respond(dialog.id, 0)).toThrow("操作已过期");
});

it("discards cancelled, expired and foreign-source callbacks", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const ui = new SourceUi((text) => text);
  const apply = vi.fn();
  const create = async () => {
    const [event] = await ui.capture(() =>
      ui.dialog("Confirm", "", [{ text: "Apply", callback: apply }]),
    );
    if (event.type !== "dialog") throw new Error("Expected dialog");
    return event;
  };
  const cancelled = await create();
  await ui.respond(cancelled.id, null);
  expect(() => ui.respond(cancelled.id, 0)).toThrow("操作已过期");
  const expired = await create();
  const other = new SourceUi((text) => text);
  expect(() => other.respond(expired.id, 0)).toThrow("操作已过期");
  vi.setSystemTime(Date.now() + 5 * 60_000);
  expect(() => ui.respond(expired.id, 0)).toThrow("操作已过期");
  expect(apply).not.toHaveBeenCalled();
});

it("isolates concurrent action messages and captures unreturned network continuations", async () => {
  const ui = new SourceUi((text) => text);
  const first = ui.capture(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    ui.message("first");
  });
  const second = ui.capture(() => {
    void (async () => {
      const response = await ui.track(Promise.resolve(ui.observeResponse(new Response("second"))));
      ui.message(await response.text());
    })();
  });
  expect(await first).toEqual([{ type: "message", message: "first" }]);
  expect(await second).toEqual([{ type: "message", message: "second" }]);
});
