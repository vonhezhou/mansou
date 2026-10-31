import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SearchControls } from "./SearchControls.js";

it("fills history into the focused search input and keeps deletion separate from searching", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const change = vi.fn(),
    search = vi.fn(),
    remove = vi.fn(),
    clear = vi.fn();
  try {
    await act(async () =>
      root.render(
        <SearchControls
          busy={false}
          sourceKey="source"
          sources={[{ key: "source", name: "Source", hasSearch: true }]}
          keyword=""
          searchMode="single"
          aggregateSourceKeys={[]}
          searchHistory={["历史关键词"]}
          onKeywordChange={change}
          onSearchModeChange={vi.fn()}
          onSearch={search}
          onRemoveSearchHistory={remove}
          onClearSearchHistory={clear}
        />,
      ),
    );
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
    await act(async () => buttons.find((button) => button.textContent === "历史关键词")!.click());
    expect(change).toHaveBeenCalledWith("历史关键词");
    expect(document.activeElement).toBe(container.querySelector("input"));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="删除搜索历史：历史关键词"]')!
        .click(),
    );
    expect(remove).toHaveBeenCalledWith("历史关键词");
    await act(async () => buttons.find((button) => button.textContent === "清空历史")!.click());
    expect(clear).toHaveBeenCalledOnce();
    expect(search).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
