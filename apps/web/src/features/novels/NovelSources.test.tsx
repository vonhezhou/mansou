import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NovelSources } from "./NovelSources.js";
import { novelApi, type NovelState } from "../../api/novels.js";

it.each([0, 1])("导入结果展示拒绝原因，成功 %s 项时仍允许查看明细", async (importedCount) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
  const state: NovelState = { sources: [], subscriptions: [] };
  const result = {
    ...state,
    importedCount,
    rejected: [{ name: "不兼容源", reason: "下载尚不支持 JS" }],
  };
  vi.spyOn(novelApi, "import").mockResolvedValue(result);
  const onChange = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (text: string) =>
    act(async () =>
      [...container.querySelectorAll("button")].find((item) => item.textContent === text)!.click(),
    );
  try {
    await act(async () =>
      root.render(
        <NovelSources state={state} busy={false} run={(work) => work()} onChange={onChange} />,
      ),
    );
    await click("导入书源");
    await act(async () => {
      const field = container.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        field,
        "{}",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("保存为自定义书源");
    expect(onChange).toHaveBeenCalledWith(state);
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    expect(container.querySelector(".novel-import-result")?.textContent).toContain(
      `已导入 ${importedCount} 个，拒绝 1 个`,
    );
    expect(container.querySelector(".novel-import-result")?.textContent).toContain(
      "下载尚不支持 JS",
    );
    expect(container.querySelector("textarea")!.value).toBe(importedCount ? "" : "{}");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("喵公子快捷填入仍由用户提交；兼容筛选同时要求搜索和下载支持", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const state: NovelState = {
    subscriptions: [{ id: "local", name: "本地", count: 3, enabled: true }],
    sources: [
      { id: "ok", name: "可用规则", searchSupported: true, downloadSupported: true },
      { id: "search", name: "仅搜索", searchSupported: true, downloadSupported: false },
      { id: "browser", name: "需要浏览器", searchSupported: false, downloadSupported: false },
    ].map((source) => ({
      ...source,
      groupId: "local",
      url: `https://${source.id}.test`,
      hash: source.id,
      enabled: true,
    })),
  };
  const save = vi.spyOn(novelApi, "subscription").mockResolvedValue(state);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };
  try {
    await act(async () =>
      root.render(
        <NovelSources state={state} busy={false} run={(work) => work()} onChange={() => {}} />,
      ),
    );
    expect(container.querySelectorAll(".installed-source-grid article")).toHaveLength(3);
    await act(async () => {
      const select = [...container.querySelectorAll("select")].find((item) =>
        item.parentElement?.textContent?.startsWith("规则能力"),
      )!;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        "supported",
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll(".installed-source-grid article")).toHaveLength(1);
    expect(container.querySelector(".installed-source-grid")!.textContent).toContain("可用规则");
    await click("订阅管理");
    await click("填入喵公子订阅");
    expect(save).not.toHaveBeenCalled();
    const form = container.querySelector("form")!;
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(save).toHaveBeenCalledWith(
      { name: "喵公子书源", url: "http://yuedu.miaogongzi.net/shuyuan/miaogongziDY.json" },
      undefined,
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
