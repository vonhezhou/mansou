import { expect, it } from "vitest";
import {
  hasSearchRecommendations,
  loadSearchRecommendations,
} from "../src/adapters/venera/searchRecommendations.js";
import type { VeneraComicSource } from "../src/adapters/venera/types.js";

function source(parts: NonNullable<VeneraComicSource["category"]>["parts"]): VeneraComicSource {
  return { key: "test", name: "Test", version: "1", category: { parts } };
}

it("keeps only ordinary search targets, preserves keywords and translates labels", async () => {
  const plugin = source([
    {
      name: "Tags",
      type: "fixed",
      itemType: "search",
      categories: ["hero", " hero ", "artist:name", ""],
    },
    { name: "Categories", type: "fixed", itemType: "category", categories: ["Adventure"] },
    {
      name: "New",
      type: "fixed",
      categories: [
        { label: "A", target: { page: "search", attributes: { keyword: "alpha" } } },
        { label: "B", target: { page: "search", attributes: { text: "beta" } } },
        { label: "C", target: { action: "search", keyword: "gamma" } },
        { label: "D", target: "search:delta" },
        { label: "E", target: "search:artist:person" },
        {
          label: "F",
          target: { page: "search", attributes: { text: "word", options: ["special"] } },
        },
        { label: "G", target: { action: "category", keyword: "category" } },
        null,
      ],
    },
  ]);
  plugin.translate = (value) => (value === "Tags" ? "标签" : value === "hero" ? "英雄" : value);
  expect(hasSearchRecommendations(plugin)).toBe(true);
  const groups = await loadSearchRecommendations(plugin);
  expect(groups.map((group) => group.id)).toEqual(["0", "2"]);
  expect(groups[0]).toMatchObject({
    title: "标签",
    random: false,
    items: [{ label: "英雄", keyword: "hero" }],
  });
  expect(groups[1]!.items.map((item) => item.keyword)).toEqual(["alpha", "beta", "gamma", "delta"]);
  expect(groups[1]!.items[1]!.target).toEqual({ page: "search", attributes: { text: "beta" } });
});

it("loads dynamic groups on demand and keeps random pools without sampling on the server", async () => {
  let loads = 0;
  const plugin = source([
    {
      name: "Random",
      type: "random",
      randomNumber: 2,
      itemType: "search",
      categories: ["a", "b", "c"],
    },
    {
      name: "Dynamic",
      type: "dynamic",
      loader: async () => {
        loads++;
        return [{ label: "Fresh", target: { action: "search", keyword: `fresh${loads}` } }];
      },
    },
  ]);
  expect(hasSearchRecommendations(plugin)).toBe(true);
  expect(loads).toBe(0);
  const groups = await loadSearchRecommendations(plugin);
  expect(groups[0]).toMatchObject({ random: true, limit: 2 });
  expect(groups[0]!.items).toHaveLength(3);
  expect(groups[1]!.items[0]!.keyword).toBe("fresh1");
  expect((await loadSearchRecommendations(plugin))[1]!.items[0]!.keyword).toBe("fresh2");
});

it("returns no recommendations for unsupported sources and reports dynamic loading failures", async () => {
  const plugin = source([
    { name: "Categories", type: "fixed", itemType: "category", categories: ["a"] },
  ]);
  expect(hasSearchRecommendations(plugin)).toBe(false);
  expect(await loadSearchRecommendations(plugin)).toEqual([]);
  await expect(
    loadSearchRecommendations(source([{ name: "Broken", type: "dynamic", loader: () => ({}) }])),
  ).rejects.toThrow("数组");
});
