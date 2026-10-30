import { expect, it } from "vitest";
import { mergeSettingsDraft } from "./settingsDraft.js";

it("preserves edited fields while accepting source changes to untouched fields", () => {
  const previous = { domain: "1", order: "old" };
  const draft = JSON.stringify({ domain: "2", order: "old" });
  expect(
    JSON.parse(mergeSettingsDraft(previous, draft, { domain: "1", order: "new", token: "saved" })),
  ).toEqual({ domain: "2", order: "new", token: "saved" });
});
it("preserves unsaved removals and invalid JSON without erasing the draft", () => {
  expect(JSON.parse(mergeSettingsDraft({ domain: "1" }, "{}", { domain: "2" }))).toEqual({});
  for (const draft of ["{invalid", "null", "[]"])
    expect(mergeSettingsDraft({}, draft, { domain: "1" })).toBe(draft);
});
