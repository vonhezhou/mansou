import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, value: unknown) {
  await ensureDir(path.dirname(file));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}
