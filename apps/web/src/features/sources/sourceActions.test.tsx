import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SourceSettingsPanel } from "./SourceSettingsPanel.js";
import { mansouApi } from "../../api/mansou.js";
import type { SourceSettingsActionResult } from "../../types.js";

let root: Root;
let container: HTMLDivElement;
let unmounted: boolean;
const change = vi.fn();
const dialog = {
  type: "dialog" as const,
  id: "dialog-one",
  title: "更新成功",
  message: "线路 1\n线路 2",
  buttons: ["取消", "应用"],
};
const result: SourceSettingsActionResult = {
  schema: {},
  values: { region: "cn" },
  events: [dialog],
};
const done: SourceSettingsActionResult = {
  schema: {},
  values: { region: "us" },
  events: [{ type: "message", message: "线路已更新" }],
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  unmounted = false;
  vi.spyOn(mansouApi, "invokeSourceSetting").mockResolvedValue(result);
  vi.spyOn(mansouApi, "respondToSourceDialog").mockImplementation(async (_key, _id, index) =>
    index !== 1 ? { ...result, events: [] } : done,
  );
  const settings = {
    schema: {
      refresh: { type: "callback" as const, buttonText: "刷新" },
      region: { type: "input" as const, title: "地区", default: "cn" },
    },
    values: { region: "cn" },
  };
  function Harness() {
    const [json, setJson] = useState(JSON.stringify(settings.values));
    return (
      <SourceSettingsPanel
        sourceKey="one"
        sourceSettingsKey="one"
        sourceSettings={settings}
        busy={false}
        settingsJson={json}
        onSettingsJsonChange={(value) => {
          change(value);
          setJson(value);
        }}
        onSaveSourceSettings={vi.fn()}
        onResetSourceSettings={vi.fn()}
      />
    );
  }
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function button(label: string) {
  return [...container.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  )!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function unmount() {
  await act(async () => root.unmount());
  unmounted = true;
}

it("waits for confirmation and blocks repeated requests before showing the source result", async () => {
  await act(async () => {
    button("刷新").click();
    button("刷新").click();
  });
  expect(mansouApi.invokeSourceSetting).toHaveBeenCalledOnce();
  expect(mansouApi.respondToSourceDialog).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(container.textContent).toContain("线路 1\n线路 2");
  await act(async () => {
    button("应用").click();
    button("应用").click();
  });
  expect(mansouApi.respondToSourceDialog).toHaveBeenCalledTimes(1);
  expect(mansouApi.respondToSourceDialog).toHaveBeenCalledWith("one", dialog.id, 1);
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).toContain("线路已更新");
  expect(change).toHaveBeenLastCalledWith(JSON.stringify(done.values, null, 2));
});

it("dismisses with Escape and discards pending callbacks when leaving the source", async () => {
  await click("刷新");
  await act(async () =>
    container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(mansouApi.respondToSourceDialog).toHaveBeenCalledWith("one", dialog.id, null);
  await click("刷新");
  await unmount();
  expect(mansouApi.respondToSourceDialog).toHaveBeenCalledTimes(2);
});

it("lets an expired confirmation recover by invoking the setting again", async () => {
  vi.mocked(mansouApi.respondToSourceDialog).mockRejectedValueOnce(
    new Error("操作已过期，请重新执行源操作。"),
  );
  await click("刷新");
  await click("应用");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("操作已过期");
  vi.mocked(mansouApi.invokeSourceSetting).mockResolvedValueOnce(done);
  await click("刷新");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("线路已更新");
});

it("discards a late dialog response after switching away without changing another source's form", async () => {
  let resolve!: (value: SourceSettingsActionResult) => void;
  vi.mocked(mansouApi.invokeSourceSetting).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await click("刷新");
  await unmount();
  await act(async () => resolve(result));
  expect(change).not.toHaveBeenCalled();
  expect(mansouApi.respondToSourceDialog).toHaveBeenCalledWith("one", dialog.id, null);
});

it("preserves unsaved settings through refresh and cancellation and restores the initiating button's focus", async () => {
  const field = container.querySelector<HTMLInputElement>(".source-setting-fields input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      field,
      "unsaved",
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("刷新");
  expect(field.value).toBe("unsaved");
  await click("取消");
  expect(field.value).toBe("unsaved");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("已取消操作。");
  expect(document.activeElement).toBe(button("刷新"));
});
