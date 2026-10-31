import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSources } from "./useSources.js";
import { mansouApi } from "../api/mansou.js";

let state: ReturnType<typeof useSources>;
let root: Root;
let container: HTMLDivElement;
const changeSource = vi.fn();
const installed = [{ key: "mock", name: "Mock", hasSearch: true }];
const metadata = [{ key: "mock", name: "Mock", enabled: true }];
const repository = [{ key: "example", name: "示例源", fileName: "example.js" }];

function Harness({ active = false, sourceKey = "" }: { active?: boolean; sourceKey?: string }) {
  state = useSources(async (_, task) => task(), sourceKey, changeSource, active);
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(mansouApi, "listInstalledSources").mockResolvedValue(installed);
  vi.spyOn(mansouApi, "listSourceMetadata").mockResolvedValue(metadata);
  vi.spyOn(mansouApi, "listAvailableSources").mockResolvedValue([]);
  vi.spyOn(mansouApi, "refreshRepository").mockResolvedValue({ sources: repository });
  await act(async () => root.render(<Harness />));
});

it("进入源管理时刷新近期状态，离开后停止刷新并丢弃旧响应", async () => {
  vi.useFakeTimers();
  try {
    await act(async () => root.render(<Harness active />));
    expect(mansouApi.listSourceMetadata).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mansouApi.listSourceMetadata).toHaveBeenCalledTimes(2);
    const pending = deferred<typeof metadata>();
    vi.mocked(mansouApi.listSourceMetadata).mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    await act(async () => root.render(<Harness />));
    await act(async () => pending.resolve([{ key: "stale", name: "过期源", enabled: true }]));
    expect(state.sourceMetadata).toEqual(metadata);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mansouApi.listSourceMetadata).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

it("状态刷新失败时保留记录并提示，后续成功可恢复", async () => {
  vi.useFakeTimers();
  try {
    await act(async () => root.render(<Harness active />));
    vi.mocked(mansouApi.listSourceMetadata).mockRejectedValueOnce(new Error("offline"));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(state.sourceMetadata).toEqual(metadata);
    expect(state.metadataRefreshError).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(state.metadataRefreshError).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("fetches the repository on first use and rechecks installed versions after refreshing", async () => {
  vi.mocked(mansouApi.listSourceMetadata)
    .mockResolvedValueOnce(metadata)
    .mockResolvedValueOnce([{ ...metadata[0], availableVersion: "1.1.0" }]);
  await act(async () => {
    await state.loadSources();
  });
  expect(mansouApi.refreshRepository).toHaveBeenCalledOnce();
  expect(state.availableSources).toEqual(repository);
  expect(state.sourceMetadata[0].availableVersion).toBe("1.1.0");
  expect(changeSource).toHaveBeenCalledWith("mock");
});

it("uses the cached repository without requiring network access", async () => {
  vi.mocked(mansouApi.listAvailableSources).mockResolvedValue(repository);
  await act(async () => {
    await state.loadSources();
  });
  expect(mansouApi.refreshRepository).not.toHaveBeenCalled();
  expect(state.availableSources).toEqual(repository);
});

it("preserves installed sources if the initial repository fetch fails", async () => {
  vi.mocked(mansouApi.refreshRepository).mockRejectedValue(new Error("仓库不可达"));
  await act(async () => {
    await expect(state.loadSources()).rejects.toThrow("仓库不可达");
  });
  expect(state.sources).toEqual(installed);
  expect(state.sourceMetadata).toEqual(metadata);
});

it("keeps the source operation visible until both mutation and source refresh finish", async () => {
  const response = deferred<void>();
  const refresh = deferred<void>();
  vi.spyOn(mansouApi, "setSourceEnabled").mockReturnValue(response.promise);
  const afterChange = vi.fn(() => refresh.promise);
  let enabling: Promise<void>;
  await act(async () => {
    enabling = state.setSourceEnabled(metadata[0], true, afterChange);
  });
  expect(state.sourceOperation).toMatchObject({ kind: "enable", sourceKey: "mock" });
  await act(async () => response.resolve());
  expect(afterChange).toHaveBeenCalledOnce();
  expect(state.sourceOperation?.kind).toBe("enable");
  await act(async () => {
    refresh.resolve();
    await enabling;
  });
  expect(state.sourceOperation).toBeNull();
});

it("clears the source operation when installation fails", async () => {
  vi.spyOn(mansouApi, "installSource").mockRejectedValue(new Error("安装失败"));
  const afterInstall = vi.fn();
  await act(async () => {
    await expect(state.installSource("example.js", afterInstall)).rejects.toThrow("安装失败");
  });
  expect(afterInstall).not.toHaveBeenCalled();
  expect(state.sourceOperation).toBeNull();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("clears a stale selected source when the last enabled source is removed", async () => {
  vi.mocked(mansouApi.listInstalledSources).mockResolvedValue([]);
  vi.mocked(mansouApi.listAvailableSources).mockResolvedValue(repository);
  await act(async () => state.loadSources());
  expect(changeSource).toHaveBeenCalledWith("");
});

it("requires confirmation before uninstalling and only refreshes after success", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const uninstall = vi.spyOn(mansouApi, "uninstallSource").mockResolvedValue({ ok: true });
  const refresh = vi.fn().mockResolvedValue(undefined);
  await act(async () => state.uninstallSource(metadata[0], refresh));
  expect(uninstall).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await act(async () => state.uninstallSource(metadata[0], refresh));
  expect(uninstall).toHaveBeenCalledWith("mock");
  expect(refresh).toHaveBeenCalledOnce();
  uninstall.mockRejectedValue(new Error("下载进行中"));
  await act(async () => {
    await expect(state.uninstallSource(metadata[0], refresh)).rejects.toThrow("下载进行中");
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(state.sourceOperation).toBeNull();
});

it("keeps the configuration source separate from the search source and loads its settings", async () => {
  vi.mocked(mansouApi.listSourceMetadata).mockResolvedValue([
    ...metadata,
    { key: "disabled", name: "Disabled", enabled: false },
  ]);
  const settings = vi
    .spyOn(mansouApi, "getSourceSettings")
    .mockResolvedValue({ schema: {}, values: {} });
  await act(async () => state.loadSources());
  await act(async () => state.changeManagedSource("disabled"));
  await act(async () => state.changeSourceKey("mock"));
  expect(state.managedSourceKey).toBe("disabled");
  await act(async () => state.loadSourceSettings());
  expect(settings).toHaveBeenCalledWith("disabled");
  expect(state.sourceSettingsKey).toBe("disabled");
});

it("falls back to a searchable source and preserves a still-available saved selection", async () => {
  const sources = [
    { key: "details-only", name: "Details", hasSearch: false },
    { key: "first", name: "First", hasSearch: true },
    { key: "saved", name: "Saved", hasSearch: true },
  ];
  vi.mocked(mansouApi.listInstalledSources).mockResolvedValue(sources);
  vi.mocked(mansouApi.listAvailableSources).mockResolvedValue(repository);
  await act(async () => state.loadSources());
  expect(changeSource).toHaveBeenLastCalledWith("first");
  changeSource.mockClear();
  await act(async () => root.render(<Harness sourceKey="saved" />));
  await act(async () => state.loadSources());
  expect(changeSource).not.toHaveBeenCalled();
});

it("shows subscription names for identical source names and refreshes them after subscription changes", async () => {
  const installedSources = ["a", "b"].map((id) => ({
    key: `${id}:shared`,
    name: "Same",
    hasSearch: true,
  }));
  vi.mocked(mansouApi.listInstalledSources).mockResolvedValue(installedSources);
  vi.mocked(mansouApi.listSourceMetadata).mockResolvedValue(
    installedSources.map((source, index) => ({
      ...source,
      enabled: true,
      subscriptionName: `Repo ${index + 1}`,
    })),
  );
  vi.mocked(mansouApi.listAvailableSources).mockResolvedValue(repository);
  await act(async () => {
    await state.loadSources();
  });
  expect(state.sources.map((source) => source.name)).toEqual(["Same · Repo 1", "Same · Repo 2"]);
  vi.mocked(mansouApi.listSourceMetadata).mockResolvedValue(
    installedSources.map((source) => ({ ...source, enabled: true, subscriptionName: "Renamed" })),
  );
  await act(async () => state.repositorySaved(repository));
  expect(state.sources.map((source) => source.name)).toEqual(["Same · Renamed", "Same · Renamed"]);
});
