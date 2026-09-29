import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import yazl from "yazl";
export async function zipDirectory(sourceDir: string, outputFile: string) {
  const zip = new yazl.ZipFile();
  const output = createWriteStream(outputFile);
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    zip.outputStream.on("error", reject);
  });
  await addDirectoryToZip(zip, sourceDir, "");
  zip.end();
  zip.outputStream.pipe(output);
  await done;
}

async function addDirectoryToZip(zip: yazl.ZipFile, dir: string, prefix: string) {
  const entries = await readdir(dir);
  for (const entry of entries.sort()) {
    if (entry.endsWith(".cbz") || entry === "metadata.json") continue;
    const fullPath = path.join(dir, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, relativePath);
    } else if (info.isFile()) {
      zip.addFile(fullPath, relativePath);
    }
  }
}
