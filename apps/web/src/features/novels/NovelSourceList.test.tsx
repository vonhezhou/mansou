import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { novelApi, type NovelState } from "../../api/novels.js";
import { NovelSourceList } from "./NovelSourceList.js";

it("千源分页、跨页全选和筛选边界，批量删除取消及失败保留选择", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const state: NovelState = {
    sources: Array.from({ length: 1035 }, (_, i) => ({
      id: String(i),
      name: `源${i}`,
      groupId: "local",
      url: `https://source${i}.test`,
      hash: String(i),
      enabled: true,
      searchSupported: true,
      downloadSupported: i % 2 === 0,
    })),
    subscriptions: [{ id: "local", name: "本地", count: 1035, enabled: true }],
  };
  const onChange = vi.fn();
  const failed = vi.fn();
  const batch = vi.spyOn(novelApi, "batch").mockResolvedValue(state);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) =>
    [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
  const select = async (label: string, value: string) =>
    act(async () => {
      const field = [...container.querySelectorAll("select")].find((item) =>
        item.parentElement?.textContent?.startsWith(label),
      )!;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        field,
        value,
      );
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        <NovelSourceList
          state={state}
          busy={false}
          run={async (work) => {
            try {
              await work();
            } catch (error) {
              failed(error);
            }
          }}
          onChange={onChange}
          onEdit={() => {}}
        />,
      ),
    );
    expect(container.querySelectorAll("article")).toHaveLength(50);
    await act(async () =>
      container.querySelector<HTMLInputElement>('[aria-label="选择 源0"]')!.click(),
    );
    await act(async () => button("下一页").click());
    expect(container.querySelector('[aria-label="选择 源50"]')).not.toBeNull();
    expect(container.textContent).toContain("已选 1 个");
    await act(async () => button("选择全部筛选结果（1035）").click());
    await act(async () => button("批量停用").click());
    expect(batch).toHaveBeenLastCalledWith(
      state.sources.map((source) => source.id),
      "disable",
    );
    expect(onChange).toHaveBeenCalledWith(state);
    expect(container.textContent).toContain("已选 0 个");
    await act(async () => button("选择全部筛选结果（1035）").click());
    await select("规则能力", "unsupported");
    expect(container.textContent).toContain("已选 0 个");
    expect(container.querySelectorAll("article")).toHaveLength(50);
    await act(async () => button("选择全部筛选结果（517）").click());
    await act(async () => button("批量删除").click());
    expect(batch).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("517"));
    confirm.mockReturnValue(true);
    batch.mockRejectedValueOnce(new Error("服务器不可用"));
    await act(async () => button("批量删除").click());
    expect(failed).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("已选 517 个");
    await act(async () => button("批量删除").click());
    expect(batch).toHaveBeenLastCalledWith(
      state.sources.filter((source) => !source.downloadSupported).map((source) => source.id),
      "delete",
    );
    expect(container.textContent).toContain("已选 0 个");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
