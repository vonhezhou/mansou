import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NovelCatalog, NovelOrigin, NovelSource } from "../../api/novels.js";
import { NovelDetailsDialog } from "./NovelDetailsDialog.js";

const source: NovelSource = {
  id: "a",
  groupId: "local",
  name: "甲源",
  url: "https://a.test",
  hash: "v1",
  enabled: true,
  searchSupported: true,
  downloadSupported: true,
};
const origin: NovelOrigin = {
  sourceId: "a",
  sourceName: "甲源",
  name: "长目录测试",
  author: "作者",
  bookUrl: "https://a.test/book",
};
const other: NovelOrigin = {
  ...origin,
  sourceId: "b",
  sourceName: "乙源",
  bookUrl: "https://b.test/book",
};
const catalog = (count: number, complete = true): NovelCatalog => ({
  bookUrl: origin.bookUrl,
  tocUrl: "https://a.test/toc",
  tocPages: 1,
  tocComplete: complete,
  chapters: Array.from({ length: count }, (_, index) => ({
    title: `第 ${index + 1} 章`,
    url: `https://a.test/${index + 1}`,
  })),
});
let root: Root, container: HTMLDivElement;
const onDownload = vi.fn(),
  onSelect = vi.fn(),
  onClose = vi.fn();
const base = {
  origin,
  origins: [origin, other],
  sources: [source, { ...source, id: "b", name: "乙源" }],
  loading: false,
  downloading: false,
  onDownload,
  onSelect,
  onClose,
  onRefresh: vi.fn(),
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (value) => value.textContent === text || value.getAttribute("aria-label") === text,
  )!;
const setValue = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

it("五万项目录只挂载一页，支持末页、名称/序号检索和定位，下载保持原目录序号及范围边界", async () => {
  await act(async () => root.render(<NovelDetailsDialog {...base} catalog={catalog(50_000)} />));
  const rows = () => container.querySelectorAll<HTMLButtonElement>(".novel-catalog li button");
  expect(rows()).toHaveLength(50);
  await act(async () => button("末页").click());
  expect(rows()[49].title).toBe("第 50000 章");
  await act(async () => rows()[49].click());
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
  expect(inputs[0].value).toBe("50000");
  expect(inputs[1].value).toBe("1");
  const search = container.querySelector<HTMLInputElement>('[aria-label="搜索章节"]')!;
  await setValue(search, "49999");
  expect(rows()).toHaveLength(1);
  expect(rows()[0].title).toBe("第 49999 章");
  await act(async () => rows()[0].click());
  expect(inputs[0].value).toBe("49999");
  await setValue(search, "第 123 章");
  expect(rows()).toHaveLength(1);
  expect(rows()[0].title).toBe("第 123 章");
  await setValue(search, "没有这一章");
  expect(rows()).toHaveLength(0);
  await act(async () => button("定位起始项").click());
  expect(rows()).toHaveLength(50);
  expect(rows()[49].title).toBe("第 50000 章");
  expect(rows()[48].getAttribute("aria-pressed")).toBe("true");
  await setValue(inputs[1], "3");
  expect(button("下载所选范围").disabled).toBe(true);
  expect(button("下载全部 50,000 项").disabled).toBe(false);
  await setValue(inputs[1], "2");
  await act(async () => button("下载所选范围").click());
  expect(onDownload).toHaveBeenCalledWith(false, 49999, 2);
  await setValue(inputs[0], "");
  expect(button("下载所选范围").disabled).toBe(true);
});

it("加载中允许切换来源和关闭，目录不完整时保持下载禁用", async () => {
  await act(async () => root.render(<NovelDetailsDialog {...base} loading />));
  expect(button("乙源").disabled).toBe(false);
  await act(async () => button("乙源").click());
  expect(onSelect).toHaveBeenCalledWith(other);
  await act(async () => button("关闭详情").click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(button("下载所选范围").disabled).toBe(true);
  await act(async () => root.render(<NovelDetailsDialog {...base} catalog={catalog(2, false)} />));
  expect(button("下载所选范围").disabled).toBe(true);
  expect(button("下载全部 2 项").disabled).toBe(true);
  expect(container.textContent).toContain("目录尚未遍历完");
});
