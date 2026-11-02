import { createWriteStream } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";

type Book = { id: string; name: string; author: string; createdAt: string };
type Chapter = { title: string; file: string };

// 正文和元数据都作为文本写入，不能把书源内容当作可执行 XHTML。
function xml(value: string) {
  return (
    value
      // eslint-disable-next-line no-control-regex -- XML 1.0 允许制表与换行，需要明确保留这些控制字符。
      .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

function xhtml(title: string, body: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh" lang="zh">
<head><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;
}

export async function writeEpub(
  book: Book,
  chapters: Chapter[],
  output: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const zip = new yazl.ZipFile();
  const outputStream = zip.outputStream as Readable;
  const staged = `${output}.tmp`;
  const options = { mtime: new Date(book.createdAt), forceDosTimestamp: true };
  const add = (name: string, content: string) => zip.addBuffer(Buffer.from(content), name, options);
  const uid = `urn:uuid:${book.id}`;
  const chapterName = (index: number) => `chapter-${index + 1}.xhtml`;
  let active: Readable | undefined;
  let bytes = 0;
  // EPUB 要求 mimetype 是首项、不压缩，且本地文件头没有扩展字段。
  zip.addBuffer(Buffer.from("application/epub+zip"), "mimetype", {
    ...options,
    compress: false,
  });
  add(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="utf-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  add(
    "EPUB/package.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${xml(uid)}</dc:identifier><dc:title>${xml(book.name)}</dc:title>
${book.author ? `<dc:creator>${xml(book.author)}</dc:creator>` : ""}<dc:language>zh</dc:language>
<meta property="dcterms:modified">${new Date(book.createdAt).toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
</metadata><manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="style" href="style.css" media-type="text/css"/>
${chapters.map((_, i) => `<item id="ch-${i + 1}" href="${chapterName(i)}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest><spine toc="ncx">${chapters.map((_, i) => `<itemref idref="ch-${i + 1}"/>`).join("")}</spine></package>`,
  );
  add(
    "EPUB/nav.xhtml",
    xhtml(
      "目录",
      `<nav epub:type="toc" id="toc"><h1>${xml(book.name)}</h1><ol>${chapters.map((chapter, i) => `<li><a href="${chapterName(i)}">${xml(chapter.title)}</a></li>`).join("")}</ol></nav>`,
    ),
  );
  add(
    "EPUB/toc.ncx",
    `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh">
<head><meta name="dtb:uid" content="${xml(uid)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${xml(book.name)}</text></docTitle><navMap>${chapters.map((chapter, i) => `<navPoint id="ch-${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(chapter.title)}</text></navLabel><content src="${chapterName(i)}"/></navPoint>`).join("")}</navMap></ncx>`,
  );
  add("EPUB/style.css", "body { line-height: 1.6; } p { text-indent: 2em; margin: 0.5em 0; }");
  for (const [index, chapter] of chapters.entries()) {
    // 顺序按需读取，每次只保留一章正文，避免整本载入内存。
    zip.addReadStreamLazy(`EPUB/${chapterName(index)}`, options, (callback) => {
      readFile(chapter.file, { encoding: "utf8", signal })
        .then((body) => {
          signal.throwIfAborted();
          bytes += Buffer.byteLength(body);
          if (bytes > 200 * 1024 * 1024) throw new Error("小说正文超过 200 MiB，停止导出");
          const paragraphs = body.split(/\r\n?|\n/).map((line) => `<p>${xml(line) || "<br/>"}</p>`);
          active = Readable.from([
            xhtml(chapter.title, `<h1>${xml(chapter.title)}</h1>${paragraphs.join("")}`),
          ]);
          callback(null, active);
        })
        .catch((error: Error) => callback(error, Readable.from([])));
    });
  }
  zip.on("error", (error) => outputStream.destroy(error));
  zip.end();
  try {
    await pipeline(outputStream, createWriteStream(staged), { signal });
    signal.throwIfAborted();
    await rename(staged, output);
  } finally {
    active?.destroy();
    await rm(staged, { force: true });
  }
}
