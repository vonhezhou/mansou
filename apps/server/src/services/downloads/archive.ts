import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";

export async function zipDirectory(sourceDir: string, outputFile: string) {
  // 先完成目录遍历，避免遍历失败时留下未关闭的输出流。
  const files = await archiveFiles(sourceDir, "");
  const zip = new yazl.ZipFile();
  for (const file of files) {
    // 图片本身已压缩，重复 DEFLATE 几乎不省空间，却占用 CPU 并延长导出等待。
    const compressedImage = /\.(?:jpe?g|png|webp|gif|avif)$/i.test(file.relative);
    zip.addFile(file.full, file.relative, { compress: !compressedImage });
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(outputFile));
}

async function archiveFiles(
  dir: string,
  prefix: string,
): Promise<Array<{ full: string; relative: string }>> {
  const files: Array<{ full: string; relative: string }> = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const info of entries) {
    const entry = info.name;
    if (entry.endsWith(".cbz") || /\.cbz\.[\da-f-]+\.tmp$/.test(entry) || entry === "metadata.json")
      continue;
    const full = path.join(dir, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    // 普通目录项已带类型；仅符号链接需要查询目标，保持原有的跟随行为。
    const type = info.isSymbolicLink() ? await stat(full) : info;
    if (type.isDirectory()) files.push(...(await archiveFiles(full, relative)));
    else if (type.isFile()) files.push({ full, relative });
  }
  return files;
}
