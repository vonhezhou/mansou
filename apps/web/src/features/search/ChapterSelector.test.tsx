import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChapterSelector } from "./ChapterSelector.js";

let root: Root;
let container: HTMLDivElement;
const preview = vi.fn();
const chapters = Object.fromEntries(
  Array.from({ length: 205 }, (_, index) => [`ep${index}`, `第 ${index + 1} 章`]),
);
function Harness() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ChapterSelector
      chapters={chapters}
      episodeId={null}
      selectedEpisodeIds={selected}
      episodePageCounts={{}}
      onPreviewEpisode={preview}
      onToggleSelectedEpisode={(id) =>
        setSelected((current) =>
          current.includes(id) ? current.filter((key) => key !== id) : [...current, id],
        )
      }
      onSelectEpisodes={(action) => {
        if (action === "all") setSelected(Object.keys(chapters));
      }}
    />
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
it("pages chapter actions without losing selection across pages or restricting select-all to visible chapters", async () => {
  expect(container.querySelectorAll(".chapter-chip")).toHaveLength(100);
  await act(async () => button("下一页章节").click());
  const checkbox = container.querySelector<HTMLInputElement>(".chapter-chip input")!;
  await act(async () => checkbox.click());
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".chapter-chip button")!.click(),
  );
  expect(preview).toHaveBeenCalledWith("ep100");
  await act(async () => button("上一页章节").click());
  await act(async () => button("下一页章节").click());
  expect(container.querySelector<HTMLInputElement>(".chapter-chip input")!.checked).toBe(true);
  await act(async () => button("全选").click());
  expect(container.textContent).toContain("已选 205 章");
  await act(async () => button("下一页章节").click());
  expect(container.querySelectorAll(".chapter-chip")).toHaveLength(5);
  expect(
    [...container.querySelectorAll<HTMLInputElement>(".chapter-chip input")].every(
      (item) => item.checked,
    ),
  ).toBe(true);
  expect(button("下一页章节").disabled).toBe(true);
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="章节页"]')!;
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll(".chapter-chip")).toHaveLength(100);
  expect(container.textContent).toContain("第 1 章");
});
