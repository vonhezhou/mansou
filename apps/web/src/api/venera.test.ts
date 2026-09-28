import { describe, expect, it } from "vitest";
import { downloadsEventUrl, imageUrl, veneraApi } from "./venera.js";

describe("cookie-authenticated resource URLs", () => {
  it("encodes image context without embedding credentials", () => {
    expect(imageUrl("mock", "cover", "comic", "ep", true)).toBe(
      "/api/v1/image?sourceKey=mock&imageKey=cover&thumbnail=true&comicId=comic&episodeId=ep",
    );
  });
  it("keeps streams and archive downloads free of tokens", () => {
    expect(downloadsEventUrl()).toBe("/api/v1/downloads/events");
    expect(veneraApi.downloadDownloadCbzUrl("a/b")).toBe("/api/v1/downloads/a%2Fb/cbz");
  });
});
