export type Comic = {
  id: string;
  title: string;
  cover: string;
  subtitle?: string;
  tags?: string[];
  description?: string;
  sourceKey: string;
  maxPage?: number;
  language?: string;
  stars?: number;
};

export type SearchResult = {
  comics: Comic[];
  maxPage?: number;
  next?: string | null;
};

export type ComicDetails = {
  comicId: string;
  sourceKey: string;
  title: string;
  cover: string;
  subtitle?: string;
  description?: string;
  tags?: Record<string, string[]>;
  chapters?: Record<string, string>;
  thumbnails?: string[];
  recommend?: Comic[];
  uploader?: string;
  uploadTime?: string;
  updateTime?: string;
  url?: string;
};

export type SearchOptions = Array<{
  label: string;
  type?: string;
  options: string[];
  default?: unknown;
}>;
export type SearchInput = {
  keyword: string;
  page?: number;
  cursor?: string | null;
  options?: string[];
};
export type SearchRecommendationGroup = {
  id: string;
  title: string;
  random: boolean;
  limit: number;
  items: Array<{
    label: string;
    keyword: string;
    target: { page: string; attributes: Record<string, unknown> };
  }>;
};
export type ImageInput = {
  imageKey: string;
  comicId?: string;
  episodeId?: string | null;
  thumbnail?: boolean;
};
export type SettingDefinition = {
  title?: string;
  type?: "input" | "select" | "switch" | "callback";
  default?: unknown;
  options?: Array<{ value: unknown; text?: string } | string>;
  validator?: string | null;
  buttonText?: string;
};
export type SourceSettings = {
  schema: Record<string, SettingDefinition>;
  values: Record<string, unknown>;
};
export type SourceUiEvent =
  | { type: "message"; message: string }
  | { type: "dialog"; id: string; title: string; message: string; buttons: string[] };
export type SourceSettingsActionResult = SourceSettings & { events: SourceUiEvent[] };
export type SourceAuth = {
  loggedIn: boolean;
  methods: Array<"password" | "cookies">;
  cookieFields: string[];
  webview: "unavailable" | "unsupported";
  registerUrl?: string;
};
export type LoginInput =
  | { method: "password"; username: string; password: string }
  | { method: "cookies"; values: string[] };
export type SourceMetadata = {
  key: string;
  name: string;
  version: string;
  url: string;
  capabilities: {
    search: boolean;
    details: boolean;
    pages: boolean;
    settings: boolean;
    authentication: boolean;
  };
  searchOptions: SearchOptions;
  hasSearchRecommendations?: boolean;
};
/** 稳定的单源协议；不支持的能力拒绝调用，推荐词发现接口则返回空数组。 */
export interface SourceProvider {
  metadata(): Promise<SourceMetadata>;
  search(input: SearchInput): Promise<SearchResult>;
  searchRecommendations(): Promise<SearchRecommendationGroup[]>;
  comicDetails(comicId: string): Promise<ComicDetails>;
  comicPages(comicId: string, episodeId?: string | null): Promise<{ images: string[] }>;
  loadImageBytes(input: ImageInput): Promise<{ data: Uint8Array; contentType: string }>;
  settings(): Promise<SourceSettings>;
  updateSettings(values: Record<string, unknown>): Promise<SourceSettings>;
  resetSettings(): Promise<SourceSettings>;
  invokeSetting(key: string): Promise<SourceSettingsActionResult>;
  respondToDialog(id: string, buttonIndex: number | null): Promise<SourceSettingsActionResult>;
  auth(): Promise<SourceAuth>;
  login(input: LoginInput): Promise<SourceAuth>;
  logout(): Promise<SourceAuth>;
  cookies(): Promise<Array<Record<string, unknown>>>;
  importCookies(
    url: string,
    values: Array<string | Record<string, unknown>> | string,
  ): Promise<Array<Record<string, unknown>>>;
  clearCookies(): Promise<void>;
}
export interface SourceRegistry {
  get(sourceKey: string): SourceProvider;
  list(): SourceMetadata[];
}
