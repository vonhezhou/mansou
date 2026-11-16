import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  isSourcePreferred,
  observeInterestDownloads,
  preferSource,
  recordSourceInterest,
  rememberInterestDownload,
  resetSourceInterest,
  sourcePreferences,
} from "./sourceInterest.js";
let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("曝光归一化、重复行为去重，漫画与小说偏好分开", () => {
  recordSourceInterest("comic", "a", "exposure", "session");
  recordSourceInterest("comic", "a", "details", "book");
  const score = sourcePreferences("comic").a;
  recordSourceInterest("comic", "a", "details", "book");
  expect(sourcePreferences("comic").a).toBeCloseTo(score);
  for (let i = 0; i < 20; i++) recordSourceInterest("comic", "a", "exposure", String(i));
  expect(sourcePreferences("comic").a).toBeLessThan(score);
  expect(sourcePreferences("novel")).toEqual({});
});

it("仅当前浏览器创建的任务获得完成奖励，快照重复不会累计", () => {
  rememberInterestDownload("novel", "a", "task");
  const before = sourcePreferences("novel").a;
  observeInterestDownloads("novel", [{ id: "other", status: "completed" }]);
  expect(sourcePreferences("novel").a).toBeCloseTo(before);
  observeInterestDownloads("novel", [{ id: "task", status: "completed" }]);
  const completed = sourcePreferences("novel").a;
  expect(completed).toBeGreaterThan(before);
  observeInterestDownloads("novel", [{ id: "task", status: "completed" }]);
  expect(sourcePreferences("novel").a).toBeCloseTo(completed);
});

it("个人选择和重置生效，重置后旧任务不会再次贡献", () => {
  preferSource("comic", "a", true);
  expect(isSourcePreferred("comic", "a")).toBe(true);
  expect(sourcePreferences("comic").a).toBe(10);
  rememberInterestDownload("comic", "a", "task");
  resetSourceInterest("comic");
  observeInterestDownloads("comic", [{ id: "task", status: "completed" }]);
  expect(sourcePreferences("comic")).toEqual({});
});

it("近期兴趣随时间衰减，损坏或不可写的本地存储保持可用", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15"));
  recordSourceInterest("comic", "a", "download", "task");
  const before = sourcePreferences("comic").a;
  vi.advanceTimersByTime(7 * 24 * 3_600_000);
  expect(sourcePreferences("comic").a).toBeCloseTo(before / 2);
  data.set("mansou:source-interest:comic", "invalid");
  expect(sourcePreferences("comic")).toEqual({});
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(() => recordSourceInterest("comic", "a", "details", "book")).not.toThrow();
});
