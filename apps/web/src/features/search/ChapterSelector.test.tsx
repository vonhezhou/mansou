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
        if (action === "clear") setSelected([]);
        if (action === "invert")
          setSelected((current) => Object.keys(chapters).filter((id) => !current.includes(id)));
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
async function filter(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
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

it("finds chapters from later pages without losing selected chapters outside the filter", async () => {
  await act(async () => container.querySelector<HTMLInputElement>(".chapter-chip input")!.click());
  await act(async () => button("下一页章节").click());
  await filter("  第 205 章  ");
  expect(container.querySelectorAll(".chapter-chip")).toHaveLength(1);
  expect(container.textContent).toContain("匹配 1 / 205 章");
  expect(container.textContent).toContain("另有 1 章已选内容不在当前筛选中");
  await act(async () => container.querySelector<HTMLInputElement>(".chapter-chip input")!.click());
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="预览 第 205 章"]')!.click(),
  );
  expect(preview).toHaveBeenCalledWith("ep204");
  await act(async () => button("清除章节筛选").click());
  expect(container.querySelector<HTMLSelectElement>('[aria-label="章节页"]')?.value).toBe("1");
  expect(container.querySelector<HTMLInputElement>(".chapter-chip input")!.checked).toBe(true);
  expect(container.textContent).toContain("已选 2 章");
  await act(async () => button("下一页章节").click());
  await act(async () => button("下一页章节").click());
  expect(container.querySelectorAll<HTMLInputElement>(".chapter-chip input")[4].checked).toBe(true);
});

it("keeps bulk actions global while filtering and recovers from an empty match", async () => {
  await filter("不存在的章节");
  expect(container.querySelectorAll(".chapter-chip")).toHaveLength(0);
  expect(container.textContent).toContain("没有匹配的章节");
  expect(container.textContent).toContain("匹配 0 / 205 章");
  await act(async () => button("全选全部章节").click());
  expect(container.textContent).toContain("已选 205 章");
  await act(async () => button("反选全部章节").click());
  expect(container.textContent).toContain("已选 0 章");
  await act(async () => button("清除章节筛选").click());
  expect(container.querySelectorAll(".chapter-chip")).toHaveLength(100);
  expect(container.textContent).not.toContain("没有匹配的章节");
});
