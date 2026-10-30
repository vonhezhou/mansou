import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSources } from "./useSources.js";
import { mansouApi } from "../api/mansou.js";

let state: ReturnType<typeof useSources>;
let root: Root;
let container: HTMLDivElement;
const changeSource = vi.fn();
const installed = [{ key: "mock", name: "Mock" }];
const metadata = [{ key: "mock", name: "Mock", enabled: true }];
const repository = [{ key: "example", name: "示例源", fileName: "example.js" }];

function Harness() {
  state = useSources(async (_, task) => task(), "", changeSource);
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
  await act(async () => state.setInstallSource("example.js"));
  const afterInstall = vi.fn();
  await act(async () => {
    await expect(state.installSelectedSource(afterInstall)).rejects.toThrow("安装失败");
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
