import path from "node:path";
import { writeFile } from "node:fs/promises";
export async function writeImage(
  outputDir: string,
  index: number,
  imageKey: string,
  image: { data: Uint8Array; contentType: string },
) {
  const file = path.join(
    outputDir,
    `${String(index + 1).padStart(4, "0")}${extensionFromContentType(image.contentType, imageKey)}`,
  );
  await writeFile(file, image.data);
  return file;
}
function extensionFromContentType(contentType: string, imageKey: string) {
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("svg")) return ".svg";
  const pathname = urlPathname(imageKey);
  const match = pathname.match(/\.[a-zA-Z0-9]+$/);
  return match?.[0] ?? ".bin";
}

function urlPathname(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}
