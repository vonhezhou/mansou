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
  for (const entry of (await readdir(dir)).sort()) {
    if (entry.endsWith(".cbz") || /\.cbz\.[\da-f-]+\.tmp$/.test(entry) || entry === "metadata.json")
      continue;
    const full = path.join(dir, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const info = await stat(full);
    if (info.isDirectory()) files.push(...(await archiveFiles(full, relative)));
    else if (info.isFile()) files.push({ full, relative });
  }
  return files;
}
