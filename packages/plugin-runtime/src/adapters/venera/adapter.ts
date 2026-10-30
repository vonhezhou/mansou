import type {
  SourceProvider,
  SourceMetadata,
  SourceSettings,
  SourceAuth,
  SearchInput,
  LoginInput,
  ImageInput,
  ComicDetails,
  SettingDefinition,
} from "@mansou/core";
import type { SourceUi } from "./sourceUi.js";
import type { VeneraComicSource } from "./types.js";
import type { RuntimeOptions } from "../../options.js";
import type { SourceDataStore } from "../../host/dataStore.js";
import type { SourceCookieStore } from "../../host/cookieStore.js";
import { PluginRuntimeError } from "../../errors.js";
import { sourceSettingsSchema, settingAction } from "./comicSourceBase.js";
import { normalizeComic, normalizeValue, normalizeChapters } from "./normalize.js";
import { loadSourceImage } from "./sourceImage.js";
import { loadBaoziPages, loadComickPages, thumbnailToImageUrl } from "./sourcePatches.js";

/** All Venera interpretation happens here, inside the chosen executor. */
export class VeneraAdapter implements SourceProvider {
  private accountOperation: Promise<unknown> = Promise.resolve();
  private accountExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.accountOperation.then(operation);
    this.accountOperation = next.catch(() => undefined);
    return next;
  }
  constructor(
    private readonly source: VeneraComicSource,
    private readonly data: SourceDataStore,
    private readonly cookieStore: SourceCookieStore,
    private readonly globals: Record<string, unknown>,
    private readonly options: RuntimeOptions,
    private readonly fetch: typeof globalThis.fetch,
    private readonly ui: SourceUi,
  ) {}

  async metadata(): Promise<SourceMetadata> {
    const source = this.source;
    return {
      key: source.key,
      name: source.name,
      version: source.version ?? "0.0.0",
      url: source.url ?? "",
      capabilities: {
        search: Boolean(source.search?.load || source.search?.loadNext),
        details: Boolean(source.comic?.loadInfo),
        pages: Boolean(source.comic?.loadEp),
        settings: Object.keys(sourceSettingsSchema(source)).length > 0,
        authentication: Boolean(source.account),
      },
      searchOptions: JSON.parse(JSON.stringify(source.search?.optionList ?? [])),
    };
  }

  async search(input: SearchInput) {
    const search = this.source.search;
    this.require(search?.load || search?.loadNext, "search");
    const options =
      input.options ??
      (search?.optionList ?? []).map((option) =>
        option.default !== undefined
          ? JSON.stringify(option.default)
          : (option.options?.[0]?.split("-")[0] ?? ""),
      );
    const result = search!.load
      ? await search!.load(input.keyword, options, Number.isFinite(input.page) ? input.page! : 1)
      : await search!.loadNext!(input.keyword, options, input.cursor ?? null);
    return {
      comics: (result.comics ?? []).map((comic) =>
        normalizeComic(comic as unknown as Record<string, unknown>, this.source.key),
      ),
      ...(search!.load ? { maxPage: result.maxPage } : { next: result.next ?? null }),
    };
  }

  async comicDetails(comicId: string): Promise<ComicDetails> {
    this.require(this.source.comic?.loadInfo, "details");
    const raw = normalizeValue(await this.source.comic!.loadInfo!(comicId)) as ComicDetails & {
      subTitle?: string;
    };
    const { subTitle, ...details } = raw;
    return {
      ...details,
      subtitle: details.subtitle ?? subTitle,
      chapters: normalizeChapters(raw.chapters),
      sourceKey: this.source.key,
      comicId,
    };
  }

  async comicPages(comicId: string, episodeId?: string | null) {
    const ep = episodeId === "_default" ? null : episodeId;
    // Preserve existing source patches in the adapter, never in application services.
    if (this.source.key === "baozi" && ep) {
      const images = await loadBaoziPages(comicId, ep, this.options, this.fetch);
      if (images.length) return { images };
    }
    this.require(this.source.comic?.loadEp, "pages");
    try {
      const result = await this.source.comic!.loadEp!(comicId, ep);
      if (!result.images?.length && this.source.key === "comick" && ep)
        return { images: await loadComickPages(comicId, ep, this.options, this.fetch) };
      return { images: result.images ?? [] };
    } catch (error) {
      if (this.source.key === "comick" && ep) {
        const images = await loadComickPages(comicId, ep, this.options, this.fetch);
        if (images.length) return { images };
      }
      // This legacy thumbnail conversion is specific to nhentai.
      if (this.source.key === "nhentai") {
        const details = await this.comicDetails(comicId);
        if (details.thumbnails?.length)
          return { images: details.thumbnails.map(thumbnailToImageUrl) };
      }
      throw error;
    }
  }

  loadImageBytes(input: ImageInput) {
    return loadSourceImage(this.source, input, this.globals, this.options, this.fetch);
  }

  async settings(): Promise<SourceSettings> {
    const schema = sourceSettingsSchema(this.source) as SourceSettings["schema"];
    const translate = (text: string) => this.source.translate?.(text) ?? text;
    for (const field of Object.values(schema)) {
      if (field.title) field.title = translate(field.title);
      if (field.buttonText) field.buttonText = translate(field.buttonText);
      if (field.options)
        field.options = field.options.map((option) =>
          typeof option === "string"
            ? translate(option) === option
              ? option
              : { value: option, text: translate(option) }
            : { ...option, ...(option.text ? { text: translate(option.text) } : {}) },
        );
    }
    return { schema, values: this.values() };
  }

  async updateSettings(values: Record<string, unknown>) {
    const schema = sourceSettingsSchema(this.source);
    for (const [key, value] of Object.entries(values)) {
      const field = schema[key] as SettingDefinition | undefined;
      if (!field || field.type === "callback") this.invalidSetting(key);
      if (field.type === "switch" && typeof value !== "boolean") this.invalidSetting(key);
      if (field.type === "input") {
        if (
          typeof value !== "string" &&
          !(
            typeof field.default === "number" &&
            typeof value === "number" &&
            Number.isFinite(value)
          )
        )
          this.invalidSetting(key);
        if (field.validator && !new RegExp(field.validator).test(String(value)))
          this.invalidSetting(key);
      }
      if (
        field.type === "select" &&
        !field.options?.some(
          (option) =>
            JSON.stringify(typeof option === "string" ? option : option.value) ===
            JSON.stringify(value),
        )
      )
        this.invalidSetting(key);
    }
    this.data.saveSync(this.source.key, "settings", { ...this.values(), ...values });
    return this.settings();
  }

  async resetSettings() {
    this.data.deleteSync(this.source.key, "settings");
    return this.settings();
  }

  async invokeSetting(key: string) {
    const action = settingAction(this.source, key);
    this.require(action, "setting action");
    const events = await this.ui.capture(() => action!.call(this.source));
    return { ...(await this.settings()), events };
  }

  async respondToDialog(id: string, buttonIndex: number | null) {
    const events = await this.ui.respond(id, buttonIndex);
    return { ...(await this.settings()), events };
  }

  async auth(): Promise<SourceAuth> {
    const account = this.source.account;
    return {
      loggedIn: this.data.loadSync(this.source.key, "account") != null,
      methods: account?.login ? ["password"] : account?.loginWithCookies ? ["cookies"] : [],
      cookieFields: account?.login ? [] : (account?.loginWithCookies?.fields ?? []),
      webview: account?.loginWithWebview ? "unsupported" : "unavailable",
      registerUrl: account?.registerWebsite,
    };
  }

  login(input: LoginInput) {
    return this.accountExclusive(() => this.performLogin(input));
  }

  private async performLogin(input: LoginInput) {
    const account = this.source.account;
    const previous = this.data.loadSync(this.source.key, "account");
    const previousCookies = (await this.cookieStore.getJar(this.source.key)).serializeSync();
    try {
      if (input.method === "password") {
        this.require(account?.login, "password login");
        await account!.login!(input.username, input.password);
        // Venera plugins can read this tuple for authenticated requests/re-login.
        this.data.saveSync(this.source.key, "account", [input.username, input.password]);
      } else {
        this.require(!account?.login && account?.loginWithCookies, "cookie login");
        const login = account!.loginWithCookies!;
        if (input.values.length !== login.fields.length || !(await login.validate(input.values)))
          throw new Error("Invalid cookies");
        this.data.saveSync(this.source.key, "account", input.values);
      }
    } catch (error) {
      await this.cookieStore.restore(this.source.key, previousCookies);
      if (previous == null) this.data.deleteSync(this.source.key, "account");
      else this.data.saveSync(this.source.key, "account", previous);
      if (error instanceof PluginRuntimeError && error.code === "SOURCE_CAPABILITY_UNSUPPORTED")
        throw error;
      // Plugin errors can echo credentials; do not return or record their original text.
      throw new PluginRuntimeError(
        "SOURCE_LOGIN_FAILED",
        "插件登录失败，请检查凭据或源服务状态",
        this.source.key,
      );
    }
    return this.auth();
  }

  logout() {
    return this.accountExclusive(() => this.performLogout());
  }

  private async performLogout() {
    await this.source.account?.logout?.();
    this.data.deleteSync(this.source.key, "account");
    await this.cookieStore.clear(this.source.key);
    return this.auth();
  }

  async cookies() {
    return JSON.parse(JSON.stringify(await this.cookieStore.list(this.source.key))) as Array<
      Record<string, unknown>
    >;
  }
  async importCookies(url: string, values: Array<string | Record<string, unknown>> | string) {
    await this.cookieStore.import(this.source.key, url, values);
    return this.cookies();
  }
  async clearCookies() {
    await this.cookieStore.clear(this.source.key);
  }
  private values() {
    return (
      (this.data.loadSync(this.source.key, "settings") as Record<string, unknown> | undefined) ?? {}
    );
  }
  private invalidSetting(key: string): never {
    throw new PluginRuntimeError(
      "SOURCE_SETTINGS_INVALID",
      `Invalid setting: ${key}`,
      this.source.key,
    );
  }
  private require(value: unknown, capability: string): asserts value {
    if (!value)
      throw new PluginRuntimeError(
        "SOURCE_CAPABILITY_UNSUPPORTED",
        `Source does not support ${capability}`,
        this.source.key,
      );
  }
}
