import path from "node:path";
import { Cookie, CookieJar, SerializedCookieJar } from "tough-cookie";
import { paths } from "../storage/paths.js";
import { ensureDir, readJson, safeFilename, writeJson } from "../utils/fs.js";

export class SourceCookieStore {
  private readonly jars = new Map<string, CookieJar>();

  async getJar(sourceKey: string) {
    const cached = this.jars.get(sourceKey);
    if (cached) return cached;

    const serialized = await readJson<SerializedCookieJar | null>(this.filePath(sourceKey), null);
    const jar = serialized ? CookieJar.deserializeSync(serialized) : new CookieJar();
    this.jars.set(sourceKey, jar);
    return jar;
  }

  async save(sourceKey: string) {
    const jar = await this.getJar(sourceKey);
    await writeJson(this.filePath(sourceKey), jar.serializeSync());
  }

  async list(sourceKey: string) {
    const jar = await this.getJar(sourceKey);
    const serialized = jar.serializeSync();
    return serialized?.cookies ?? [];
  }

  async import(sourceKey: string, url: string, cookies: Array<string | Record<string, unknown>>) {
    const jar = await this.getJar(sourceKey);
    for (const item of cookies) {
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
    const jar = new CookieJar();
    this.jars.set(sourceKey, jar);
    await ensureDir(paths.cookies);
    await writeJson(this.filePath(sourceKey), jar.serializeSync());
  }

  private filePath(sourceKey: string) {
    return path.join(paths.cookies, `${safeFilename(sourceKey)}.json`);
  }
}
