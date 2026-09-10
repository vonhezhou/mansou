import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadsEventUrl, imageUrl } from "./venera.js";
import { saveAccessTokenValue } from "./client.js";

function installLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      removeItem: (key: string) => data.delete(key),
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
}

describe("venera url helpers", () => {
  beforeEach(() => installLocalStorage());

  afterEach(() => window.localStorage.clear());

  it("builds image urls with context", () => {
    expect(imageUrl("mock", "cover", "comic", "ep", true)).toBe(
      "/api/v1/image?sourceKey=mock&imageKey=cover&thumbnail=true&comicId=comic&episodeId=ep",
    );
  });

  it("adds access token to event stream url", () => {
    saveAccessTokenValue("secret");
    expect(downloadsEventUrl()).toBe("/api/v1/downloads/events?access_token=secret");
  });
});
