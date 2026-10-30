import { describe, expect, it } from "vitest";
import { downloadsEventUrl, imageUrl, mansouApi } from "./mansou.js";

describe("cookie-authenticated resource URLs", () => {
  it("encodes image context without embedding credentials", () => {
    expect(imageUrl("mock", "cover", "comic", "ep", true)).toBe(
      "/api/v1/image?sourceKey=mock&imageKey=cover&thumbnail=true&comicId=comic&episodeId=ep",
    );
  });
  it("uses the default full-image path without a thumbnail flag", () => {
    expect(imageUrl("mock", "page", "comic", "ep")).toBe(
      "/api/v1/image?sourceKey=mock&imageKey=page&comicId=comic&episodeId=ep",
    );
  });
  it("keeps streams and archive downloads free of tokens", () => {
    expect(downloadsEventUrl()).toBe("/api/v1/downloads/events");
    expect(mansouApi.downloadDownloadCbzUrl("a/b")).toBe("/api/v1/downloads/a%2Fb/cbz");
  });
});
