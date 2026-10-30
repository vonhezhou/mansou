import path from "node:path";
import { Cookie, CookieJar, SerializedCookieJar } from "tough-cookie";
import type { StorageDatabase } from "@mansou/storage";
import { ensureDir, readJson, safeFilename, writeJson } from "./fs.js";

export class SourceCookieStore {
  private readonly jars = new Map<string, CookieJar>();

  constructor(
    private readonly storage: StorageDatabase,
    readonly dataDir: string,
  ) {}

  async getJar(sourceKey: string) {
    const cached = this.jars.get(sourceKey);
    if (cached) return cached;

    const serialized =
      this.storage?.getCookieJar(sourceKey) ??
      (await readJson<SerializedCookieJar | null>(this.filePath(sourceKey), null));
    const jar = serialized ? CookieJar.deserializeSync(serialized) : new CookieJar();
    this.jars.set(sourceKey, jar);
    return jar;
  }

  async save(sourceKey: string) {
    const jar = await this.getJar(sourceKey);
    if (this.storage) {
      this.storage.setCookieJar(sourceKey, jar.serializeSync());
      return;
    }
    await writeJson(this.filePath(sourceKey), jar.serializeSync());
  }

  async list(sourceKey: string) {
    const jar = await this.getJar(sourceKey);
    const serialized = jar.serializeSync();
    return serialized?.cookies ?? [];
  }

  async import(
    sourceKey: string,
    url: string,
    cookies: Array<string | Record<string, unknown>> | string,
  ) {
    const jar = await this.getJar(sourceKey);
    for (const item of normalizeCookieInput(cookies)) {
      if (typeof item === "string") {
        await jar.setCookie(item, url);
      } else {
        const cookie = Cookie.fromJSON(item);
        if (cookie) await jar.setCookie(cookie, url);
      }
    }
    await this.save(sourceKey);
    return this.list(sourceKey);
  }

  async clear(sourceKey: string) {
    const jar = await this.getJar(sourceKey);
    await jar.removeAllCookies();
    if (this.storage) {
      this.storage.setCookieJar(sourceKey, jar.serializeSync());
      return;
    }
    await ensureDir(path.join(this.dataDir, "cookies"));
    await writeJson(this.filePath(sourceKey), jar.serializeSync());
  }

  async restore(sourceKey: string, snapshot: SerializedCookieJar | undefined) {
    this.jars.set(sourceKey, snapshot ? CookieJar.deserializeSync(snapshot) : new CookieJar());
    await this.save(sourceKey);
  }

  private filePath(sourceKey: string) {
    return path.join(path.join(this.dataDir, "cookies"), `${safeFilename(sourceKey)}.json`);
  }
}

function normalizeCookieInput(
  cookies: Array<string | Record<string, unknown>> | string,
): Array<string | Record<string, unknown>> {
  if (Array.isArray(cookies)) return flattenCookieItems(cookies);
  const trimmed = cookies.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed))
      return flattenCookieItems(parsed as Array<string | Record<string, unknown>>);
  } catch {
    // Plain cookie text.
  }
  return parseCookieText(trimmed);
}

function flattenCookieItems(cookies: Array<string | Record<string, unknown>>) {
  const result: Array<string | Record<string, unknown>> = [];
  for (const cookie of cookies) {
    if (typeof cookie === "string") result.push(...parseCookieText(cookie));
    else result.push(cookie);
  }
  return result;
}

function parseCookieText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 1 && /^cookie:/i.test(lines[0]))
    return splitCookieHeader(lines[0].replace(/^cookie:\s*/i, ""));
  if (
    lines.length === 1 &&
    lines[0].includes(";") &&
    !/^set-cookie:/i.test(lines[0]) &&
    !/;\s*(?:expires|max-age|domain|path|samesite)\s*=|;\s*(?:secure|httponly)(?:;|$)/i.test(
      lines[0],
    )
  )
    return splitCookieHeader(lines[0]);
  return lines.flatMap((line) => {
    if (line.startsWith("#")) return [];
    const netscape = parseNetscapeCookie(line);
    if (netscape) return [netscape];
    return [line.replace(/^set-cookie:\s*/i, "")];
  });
}

function splitCookieHeader(value: string) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.includes("="));
}

function parseNetscapeCookie(line: string) {
  const parts = line.split("\t");
  if (parts.length < 7) return null;
  const [domain, , pathValue, secure, expires, key, value] = parts;
  return `${key}=${value}; Domain=${domain.replace(/^#HttpOnly_/, "")}; Path=${pathValue}; Expires=${new Date(Number(expires) * 1000).toUTCString()}${secure.toUpperCase() === "TRUE" ? "; Secure" : ""}`;
}
