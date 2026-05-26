import { describe, expect, it } from "vitest";
import { getHistoryComicId, getHistoryEpisodeId, getHistoryKey, getHistorySourceKey } from "./history.js";

describe("history helpers", () => {
  it("reads camelCase and snake_case history fields", () => {
    expect(getHistorySourceKey({ source_key: "mock", comic_id: "comic", episode_id: "ep" })).toBe("mock");
    expect(getHistoryComicId({ sourceKey: "mock", comicId: "comic", episodeId: "ep" })).toBe("comic");
    expect(getHistoryEpisodeId({ source_key: "mock", comic_id: "comic", episode_id: "ep" })).toBe("ep");
    expect(getHistoryKey({ sourceKey: "mock", comicId: "comic" })).toBe("mock:comic");
  });
});
