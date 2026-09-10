import { describe, expect, it } from "vitest";
import {
  filterDownloadItems,
  getDownloadImageKey,
  getDownloadProgress,
  groupDownloads,
} from "./downloads.js";
import type { DownloadTask } from "../types.js";

function task(id: string, status: string, error?: string): DownloadTask {
  return {
    id,
    status,
    error,
    title: id,
    sourceKey: "mock",
    comicId: id,
    phase: "images",
    total: 10,
    completed: 5,
  };
}

describe("downloads helpers", () => {
  it("groups tasks by status", () => {
    expect(
      groupDownloads([
        task("a", "running"),
        task("b", "failed"),
        task("c", "completed"),
        task("d", "cancelled"),
      ]).map((group) => group.key),
    ).toEqual(["active", "failed", "done", "other"]);
  });

  it("calculates progress safely", () => {
    expect(getDownloadProgress(task("a", "running"))).toBe(50);
    expect(getDownloadProgress({ ...task("b", "running"), total: 0 })).toBe(0);
  });

  it("filters failed detail items", () => {
    expect(
      filterDownloadItems(
        [
          { imageKey: "a", status: "done" },
          { image_key: "b", status: "running", error: "boom" },
        ],
        true,
      )?.map(getDownloadImageKey),
    ).toEqual(["b"]);
  });
});
