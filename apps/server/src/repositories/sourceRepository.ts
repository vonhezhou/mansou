import path from "node:path";
import { sourceKeyFor, parseSourceKey } from "@mansou/core";
import { AppError } from "../errors.js";
import { isNewerVersion } from "@mansou/plugin-runtime/version";
import { readdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import type { AppConfig } from "../config/config.js";
import type { AppPaths } from "../storage/paths.js";
import type { RepositorySource } from "../types/source.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";

type SubscriptionSettings = { name: string; url: string; cdnBaseUrl: string; enabled?: boolean };
type Subscription = SubscriptionSettings & {
  id: string;
  enabled: boolean;
  sources: RepositorySource[];
  updatedAt?: string;
  error?: string;
  removed?: boolean;
};

export class SourceRepositoryService {
  private mutation = Promise.resolve();
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(task);
    this.mutation = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  constructor(
    private readonly config: Pick<AppConfig, "sourceListUrl" | "sourceCdnBaseUrl">,
    private readonly paths: AppPaths,
    private readonly fetch: typeof globalThis.fetch,
  ) {}
  private defaults(): Subscription {
    return {
      id: "default",
      name: "默认订阅",
      url: this.config.sourceListUrl,
      cdnBaseUrl: this.config.sourceCdnBaseUrl,
      enabled: true,
      sources: [],
    };
  }
  private async readSubscriptions(): Promise<Subscription[]> {
    const state = await readJson<{ subscriptions: Subscription[] } | null>(
      this.paths.repositoryIndex,
      null,
    );
    return state && Array.isArray(state.subscriptions) ? state.subscriptions : [this.defaults()];
  }
  private view(subscriptions: Subscription[]) {
    return {
      subscriptions: subscriptions
        .filter((s) => !s.removed)
        .map(({ sources, ...subscription }) => ({
          ...subscription,
          sourceCount: sources.length,
        })),
      sources: subscriptions
        .filter((s) => s.enabled && !s.removed)
        .flatMap((subscription) =>
          subscription.sources.map((source) => {
            const originalKey = source.key!;
            const key = sourceKeyFor(subscription.id, originalKey);
            const variant = source.filename ?? source.fileName ?? source.url ?? source.name;
            return {
              ...source,
              key,
              originalKey,
              subscriptionId: subscription.id,
              subscriptionName: subscription.name,
              installId: `${key}#${encodeURIComponent(variant)}`,
            };
          }),
        ),
    };
  }
  async getRepository() {
    return this.view(await this.readSubscriptions());
  }
  private async persist(subscriptions: Subscription[]) {
    await ensureDir(path.dirname(this.paths.repositoryIndex));
    const staged = `${this.paths.repositoryIndex}.${crypto.randomUUID()}.tmp`;
    try {
      await writeJson(staged, { subscriptions });
      await rename(staged, this.paths.repositoryIndex);
    } finally {
      await rm(staged, { force: true });
    }
    return this.view(subscriptions);
  }
  private async replace(settings: SubscriptionSettings, id: string, create: boolean) {
    const subscriptions = await this.readSubscriptions();
    const index = subscriptions.findIndex((s) => s.id === id);
    if (!create && (index < 0 || subscriptions[index].removed))
      throw new AppError("SOURCE_NOT_FOUND", "订阅不存在");
    const url = new URL(settings.url).href;
    if (subscriptions.some((s) => !s.removed && s.id !== id && new URL(s.url).href === url))
      throw new AppError("VALIDATION_ERROR", "该订阅地址已添加");
    const sources =
      settings.enabled === false && index >= 0 && url === subscriptions[index].url
        ? subscriptions[index].sources
        : await this.fetchSources(url);
    const subscription: Subscription = {
      ...settings,
      url,
      id,
      enabled: settings.enabled ?? subscriptions[index]?.enabled ?? true,
      sources,
      updatedAt: new Date().toISOString(),
    };
    if (index < 0) subscriptions.push(subscription);
    else subscriptions[index] = subscription;
    return this.persist(subscriptions);
  }
  createRepository(settings: SubscriptionSettings) {
    return this.serialize(() => this.replace(settings, crypto.randomUUID(), true));
  }
  updateRepository(settings: SubscriptionSettings, id: string) {
    return this.serialize(() => this.replace(settings, id, false));
  }
  resetRepository() {
    return this.serialize(() => this.replace(this.defaults(), "default", true));
  }
  deleteRepository(id: string) {
    return this.serialize(async () => {
      const subscriptions = await this.readSubscriptions();
      if (!subscriptions.some((s) => s.id === id && !s.removed))
        throw new AppError("SOURCE_NOT_FOUND", "订阅不存在");
      // 保留来源名称供已安装源展示，移除的订阅不再参与发现和更新。
      return this.persist(
        subscriptions.map((s) => (s.id === id ? { ...s, enabled: false, removed: true } : s)),
      );
    });
  }
  async refreshRepository() {
    const state = await this.serialize(async () => {
      const subscriptions = await this.readSubscriptions();
      const refreshed = await Promise.all(
        subscriptions.map(async (subscription) => {
          if (!subscription.enabled) return subscription;
          try {
            return {
              ...subscription,
              sources: await this.fetchSources(subscription.url),
              updatedAt: new Date().toISOString(),
              error: undefined,
            };
          } catch (error) {
            return {
              ...subscription,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
      return this.persist(refreshed);
    });
    return state.sources;
  }
  private async fetchSources(url: string) {
    const response = await this.fetch(url, {
      headers: { "user-agent": "mansou", "accept-encoding": "identity" },
    });
    if (!response.ok)
      throw new Error(`Failed to fetch source index: ${response.status} ${response.statusText}`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid source index: expected an array");
    const list = payload.filter(
      (item): item is RepositorySource =>
        item &&
        typeof item === "object" &&
        typeof item.key === "string" &&
        !!item.key &&
        typeof item.name === "string" &&
        typeof item.version === "string" &&
        (item.url == null || typeof item.url === "string") &&
        (item.filename == null || typeof item.filename === "string") &&
        (item.fileName == null || typeof item.fileName === "string"),
    );
    if (payload.length && !list.length) throw new Error("订阅中没有有效的漫画源条目");
    return list;
  }
  async getAvailableSources() {
    return (await this.getRepository()).sources;
  }
  async withAvailableUpdates<
    T extends { key: string; script_url?: string | null; version?: string | null },
  >(installed: T[]) {
    const subscriptions = await this.readSubscriptions();
    return installed.map((source) => {
      const identity = parseSourceKey(source.key);
      const subscription = subscriptions.find((s) => s.id === identity?.subscriptionId);
      const candidate =
        identity && subscription?.enabled
          ? this.findSourceByKey(
              subscription.sources,
              identity.originalKey,
              source.script_url,
              subscription,
            )
          : undefined;
      let availableVersion: string | undefined;
      try {
        if (candidate && isNewerVersion(candidate.version, source.version ?? "0.0.0"))
          availableVersion = candidate.version;
      } catch {
        /* 无效版本不影响其他已安装源。 */
      }
      return {
        ...source,
        ...identity,
        subscriptionName: identity
          ? subscription
            ? `${subscription.name}${subscription.removed ? "（已移除）" : ""}`
            : "已移除的订阅"
          : "本地导入",
        availableVersion,
      };
    });
  }
  async installSource(
    reference: string,
    activate?: (filePath: string, key: string, originalKey: string) => Promise<void>,
    installedScriptUrl?: string | null,
  ) {
    const [sourceKey, variant] = reference.split("#");
    const identity = parseSourceKey(sourceKey);
    if (!identity) throw new AppError("SOURCE_NOT_FOUND", "请指定订阅中的漫画源");
    const repository = await this.serialize(async () => {
      const subscriptions = await this.readSubscriptions();
      const index = subscriptions.findIndex((s) => s.id === identity.subscriptionId);
      if (index < 0 || !subscriptions[index].enabled)
        throw new AppError("SOURCE_NOT_FOUND", "订阅已移除或停用");
      const subscription = subscriptions[index];
      const updated = {
        ...subscription,
        sources: await this.fetchSources(subscription.url),
        error: undefined,
        updatedAt: new Date().toISOString(),
      };
      subscriptions[index] = updated;
      await this.persist(subscriptions);
      return updated;
    });
    const candidates = repository.sources.filter((source) => source.key === identity.originalKey);
    const item =
      variant !== undefined
        ? candidates.find(
            (source) =>
              (source.filename ?? source.fileName ?? source.url ?? source.name) ===
              decodeURIComponent(variant),
          )
        : this.findSourceByKey(candidates, identity.originalKey, installedScriptUrl, repository);
    if (!item) throw new AppError("SOURCE_NOT_FOUND", "订阅中未找到对应漫画源或脚本版本");
    const scriptUrl = this.resolveScriptUrl(item, repository);
    const response = await this.fetch(scriptUrl, {
      headers: { "user-agent": "mansou", "accept-encoding": "identity" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download source script: ${response.status} ${response.statusText}`,
      );
    }

    const script = await response.text();
    if (!script.includes("extends ComicSource")) {
      throw new Error(`Downloaded source script is invalid: ${scriptUrl}`);
    }
    await ensureDir(this.paths.scripts);
    const fileName = `${encodeURIComponent(sourceKey)}.js`;
    const filePath = path.join(this.paths.scripts, fileName);
    const previous = existsSync(filePath) ? await readFile(filePath) : undefined;
    const stagedPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(stagedPath, script, "utf8");
      await rename(stagedPath, filePath);
      try {
        await activate?.(filePath, sourceKey, identity.originalKey);
      } catch (error) {
        if (previous) {
          await writeFile(stagedPath, previous);
          await rename(stagedPath, filePath);
        } else await rm(filePath, { force: true });
        throw error;
      }
    } finally {
      await rm(stagedPath, { force: true });
    }
    return {
      ...item,
      key: sourceKey,
      originalKey: identity.originalKey,
      subscriptionId: identity.subscriptionId,
      scriptUrl,
      filePath,
      hash: crypto.createHash("sha256").update(script).digest("hex"),
    };
  }

  async listInstalledScripts() {
    await ensureDir(this.paths.scripts);
    const files = await readdir(this.paths.scripts);
    const installed = files
      .filter((file) => file.endsWith(".js"))
      .map((file) => path.join(this.paths.scripts, file));
    return installed;
  }

  canUninstall(filePath: string | null) {
    return !!filePath && path.dirname(path.resolve(filePath)) === path.resolve(this.paths.scripts);
  }

  async removeScript(filePath: string | null) {
    if (!this.canUninstall(filePath)) throw new AppError("SOURCE_BUILTIN", "内置源仅支持禁用");
    await rm(filePath!, { force: true });
  }

  async readScript(filePath: string) {
    return readFile(filePath, "utf8");
  }

  private findSourceByKey(
    list: RepositorySource[],
    key: string,
    scriptUrl: string | null | undefined,
    repository: Subscription,
  ) {
    const candidates = list.filter((item) => item.key === key);
    if (scriptUrl) {
      try {
        const filename = path.posix.basename(new URL(scriptUrl).pathname);
        const variant = candidates.find((item) => {
          try {
            return (
              path.posix.basename(new URL(this.resolveScriptUrl(item, repository)).pathname) ===
              filename
            );
          } catch {
            return false;
          }
        });
        if (variant) return variant;
        if (candidates.length > 1) return undefined;
      } catch {
        /* Older metadata may not contain a valid script URL. */
      }
    }
    return candidates[0];
  }

  private resolveScriptUrl(item: RepositorySource, repository: Subscription) {
    if (item.url) return new URL(item.url, repository.url).toString();
    const filename = item.filename ?? item.fileName;
    if (!filename) {
      throw new Error(`Source has neither url nor filename: ${item.name}`);
    }
    return new URL(filename, repository.cdnBaseUrl || repository.url).toString();
  }
}
