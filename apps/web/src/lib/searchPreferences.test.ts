import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  addSearchHistory,
  readSearchHistory,
  readSearchPreferences,
  saveSearchHistory,
  saveSearchPreferences,
  searchHistoryLimit,
} from "./searchPreferences.js";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("defaults invalid storage and validates each preference independently", () => {
  localStorage.setItem("mansou:search-preferences", "broken JSON");
  expect(readSearchPreferences()).toEqual({
    sourceKey: "",
    searchMode: "single",
    aggregateSourceKeys: undefined,
  });
  localStorage.setItem(
    "mansou:search-preferences",
    JSON.stringify({
      sourceKey: "a",
      searchMode: "invalid",
      aggregateSourceKeys: ["b", null, "a", "b", ""],
    }),
  );
  expect(readSearchPreferences()).toEqual({
    sourceKey: "a",
    searchMode: "single",
    aggregateSourceKeys: ["b", "a"],
  });
});

it("roundtrips an intentionally empty aggregate selection", () => {
  saveSearchPreferences({ sourceKey: "a", searchMode: "aggregate", aggregateSourceKeys: [] });
  expect(readSearchPreferences()).toEqual({
    sourceKey: "a",
    searchMode: "aggregate",
    aggregateSourceKeys: [],
  });
});

it("keeps recent submitted terms unique and bounds history without retaining blanks", () => {
  let history: string[] = [];
  for (let i = 0; i < searchHistoryLimit + 5; i++) history = addSearchHistory(history, ` ${i} `);
  expect(history).toHaveLength(searchHistoryLimit);
  history = addSearchHistory(history, " 10 ");
  expect(history[0]).toBe("10");
  expect(history.filter((term) => term === "10")).toHaveLength(1);
  expect(addSearchHistory(history, "   ")).toEqual(history);
  saveSearchHistory(history);
  expect(readSearchHistory()).toEqual(history);
});

it("ignores malformed history entries", () => {
  localStorage.setItem("mansou:search-history", JSON.stringify([" a ", 3, null, "a", "", "b"]));
  expect(readSearchHistory()).toEqual(["a", "b"]);
});

it("keeps search usable when browser storage is blocked", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  });
  expect(readSearchHistory()).toEqual([]);
  expect(readSearchPreferences().sourceKey).toBe("");
  expect(() => saveSearchHistory(["a"])).not.toThrow();
  expect(() => saveSearchPreferences({ sourceKey: "a", searchMode: "single" })).not.toThrow();
});
