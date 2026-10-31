import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { SourceMetadata } from "../../types.js";
import { InstalledSourcesList } from "./InstalledSourcesList.js";

it("按功能展示推测依据，疑似失效不改变启用状态和配置入口", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const configure = vi.fn();
  const enable = vi.fn();
  const time = "2026-10-31T00:00:00Z";
  const source: SourceMetadata = {
    key: "sample",
    name: "示例源",
    enabled: true,
    health: {
      status: "suspected_broken",
      observedSince: time,
      checkedAt: time,
      operations: [
        {
          operation: "search",
          status: "available",
          successCount: 2,
          failureCount: 0,
          consecutiveFailures: 0,
          lastSuccessAt: time,
        },
        {
          operation: "comicDetails",
          status: "suspected_broken",
          successCount: 0,
          failureCount: 3,
          consecutiveFailures: 3,
          lastFailureAt: time,
          lastErrorCode: "PLUGIN_SOURCE_ERROR",
        },
      ],
    },
  };
  try {
    await act(async () =>
      root.render(
        <InstalledSourcesList
          busy={false}
          sourceMetadata={[source]}
          onConfigureSource={configure}
          onSetSourceEnabled={enable}
          onUninstallSource={vi.fn()}
          onUpdateSource={vi.fn()}
        />,
      ),
    );
    expect(container.querySelector("summary")?.textContent).toContain("疑似失效");
    expect(container.querySelector("summary")?.textContent).toContain("详情连续失败 3 次");
    expect(container.textContent).toContain("搜索 · 近期可用");
    expect(container.textContent).toContain("最近成功：");
    expect(container.textContent).toContain("源执行出错");
    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(enable).not.toHaveBeenCalled();
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "源设置",
    )!;
    await act(async () => button.click());
    expect(configure).toHaveBeenCalledWith("sample", "settings");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
