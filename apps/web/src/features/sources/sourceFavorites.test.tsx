import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { novelApi, type NovelState } from "../../api/novels.js";
import { NovelSourceList } from "../novels/NovelSourceList.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";

it("书源收藏优先、筛选重置分页与批量选择，取消收藏同步服务端结果", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const state: NovelState = {
    sources: Array.from({ length: 52 }, (_, index) => ({
      id: String(index),
      name: `源${index}`,
      groupId: "local",
      url: `https://source${index}.test`,
      hash: String(index),
      enabled: true,
      searchSupported: true,
      downloadSupported: true,
      favorite: index === 51,
    })),
    subscriptions: [{ id: "local", name: "本地", enabled: true, count: 52 }],
  };
  const favorite = vi.spyOn(novelApi, "favorite").mockResolvedValue({
    ...state,
    sources: state.sources.map((source) => ({ ...source, favorite: false })),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    const [value, setValue] = useState(state);
    return (
      <NovelSourceList
        state={value}
        busy={false}
        run={async (work) => work()}
        onChange={setValue}
        onEdit={() => {}}
      />
    );
  }
  const button = (text: string) =>
    [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector("article strong")?.textContent).toBe("源51");
    await act(async () =>
      container.querySelector<HTMLInputElement>('[aria-label="选择 源51"]')!.click(),
    );
    await act(async () => button("下一页").click());
    await act(async () =>
      [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
        .find((item) => item.parentElement?.textContent?.includes("仅看收藏"))!
        .click(),
    );
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("已选 0 个");
    expect(container.textContent).toContain("1 / 1");
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="取消收藏 源51"]')!.click(),
    );
    expect(favorite).toHaveBeenCalledWith("51", false);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("漫画源收藏优先且可筛选，操作使用源身份", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const change = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <InstalledSourcesList
          busy={false}
          sourceMetadata={[
            { key: "a", name: "普通源", enabled: 1 },
            { key: "b", name: "常用源", enabled: 0, favorite: true },
          ]}
          onSetSourceFavorite={change}
          onConfigureSource={() => {}}
          onUninstallSource={() => {}}
          onUpdateSource={() => {}}
          onSetSourceEnabled={() => {}}
        />,
      ),
    );
    expect(container.querySelector("article strong")?.textContent).toBe("常用源");
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(container.querySelectorAll("article")).toHaveLength(1);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="取消收藏 常用源"]')!.click(),
    );
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ key: "b" }), false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
