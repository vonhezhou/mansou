import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { writeEpub } from "../src/services/novels/epub.js";
import { zipEntries } from "../../../scripts/lib/read-zip.mjs";

let directory: string;
const book = {
  id: "12345678-1234-4234-8234-123456789abc",
  name: '中文<&"小说',
  author: "作者 & 甲",
  createdAt: "2026-11-02T00:00:00.000Z",
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "mansou-epub-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("生成 EPUB 3 与 NCX，按目录顺序保存重复章名，正文只作为安全文本写入", async () => {
  const first = path.join(directory, "20.txt"),
    second = path.join(directory, "3.txt");
  await writeFile(first, "甲 & 乙 <script>\n\n第二段 😀\u0000\ufffe");
  await writeFile(second, "末章正文");
  const output = path.join(directory, "book.epub");
  await writeEpub(
    book,
    [
      { title: "同名<&", file: first },
      { title: "同名<&", file: second },
    ],
    output,
    new AbortController().signal,
  );
  const data = await readFile(output);
  const entries = zipEntries(data);
  const text = (name: string) => entries.find((entry) => entry.name === name)!.data.toString();
  expect(entries[0]).toMatchObject({ name: "mimetype", method: 0 });
  expect(entries[0].data.toString()).toBe("application/epub+zip");
  expect(data.readUInt16LE(28)).toBe(0);
  expect(text("META-INF/container.xml")).toContain('full-path="EPUB/package.opf"');
  const opf = text("EPUB/package.opf");
  expect(opf).toContain('version="3.0"');
  expect(opf).toContain("中文&lt;&amp;&quot;小说");
  expect(opf).toContain("作者 &amp; 甲");
  expect(opf).toContain("<dc:language>zh</dc:language>");
  expect(opf).toContain('<spine toc="ncx"><itemref idref="ch-1"/><itemref idref="ch-2"/>');
  for (const name of ["EPUB/nav.xhtml", "EPUB/toc.ncx"]) {
    const nav = text(name);
    expect(nav.indexOf("chapter-1.xhtml")).toBeLessThan(nav.indexOf("chapter-2.xhtml"));
    expect(nav.match(/同名&lt;&amp;/g)).toHaveLength(2);
  }
  const chapter = text("EPUB/chapter-1.xhtml");
  expect(chapter).toContain("<p>甲 &amp; 乙 &lt;script&gt;</p><p><br/></p><p>第二段 😀</p>");
  expect(chapter).not.toContain("<script>");
  expect(text("EPUB/chapter-2.xhtml")).toContain("末章正文");
});

it("缓存缺失时拒绝导出并清理临时文件，补齐缓存后能重新生成", async () => {
  const chapter = { title: "第一章", file: path.join(directory, "0.txt") };
  const output = path.join(directory, "book.epub");
  await expect(
    writeEpub(book, [chapter], output, new AbortController().signal),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readdir(directory)).toEqual([]);
  await writeFile(chapter.file, "恢复后的正文");
  await writeEpub(book, [chapter], output, new AbortController().signal);
  expect((await readFile(output)).subarray(0, 2).toString()).toBe("PK");
});

it("打包期间取消不替换已有成品，并清理临时文件", async () => {
  const file = path.join(directory, "0.txt"),
    output = path.join(directory, "book.epub");
  await writeFile(file, "正文".repeat(100000));
  await writeFile(output, "已有成品");
  const controller = new AbortController();
  const pending = writeEpub(book, [{ title: "章节", file }], output, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(await readFile(output, "utf8")).toBe("已有成品");
  expect((await readdir(directory)).sort()).toEqual(["0.txt", "book.epub"]);
});
