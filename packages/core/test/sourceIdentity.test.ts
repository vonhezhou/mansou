import { expect, it } from "vitest";
import { parseSourceKey, sourceKeyFor } from "../src/sourceIdentity.js";

it("preserves original keys and prevents delimiter or path collisions", () => {
  for (const originalKey of ["shared", "a:b", "a/b", "a%2Fb", "漫画源", "a#variant"]) {
    const key = sourceKeyFor("subscription-one", originalKey);
    expect(parseSourceKey(key)).toEqual({ subscriptionId: "subscription-one", originalKey });
    expect(key).not.toBe(sourceKeyFor("subscription-two", originalKey));
  }
  expect(sourceKeyFor("a", "b:c")).not.toBe(sourceKeyFor("a", "b_c"));
  expect(() => sourceKeyFor("../invalid", "key")).toThrow();
  expect(parseSourceKey("raw-source")).toBeNull();
  expect(parseSourceKey("repo:bad%escape")).toBeNull();
});
