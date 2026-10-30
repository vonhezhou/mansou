// Generated from openapi.yaml. Do not edit.
export interface paths {
  "/health": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Health check */
    get: operations["getHealthLegacy"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/health": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Health check */
    get: operations["getHealth"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/openapi.json": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** OpenAPI document */
    get: operations["getOpenApi"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/source-repository": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List repository sources */
    get: operations["getSourceRepository"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/source-repository/refresh": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Refresh repository index */
    post: operations["refreshSourceRepository"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List installed sources */
    get: operations["listSources"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/available": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List available repository sources */
    get: operations["listAvailableSources"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/installed": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List installed sources */
    get: operations["listInstalledSources"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/metadata": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List persisted source metadata */
    get: operations["listSourceMetadata"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/install": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Install source */
    post: operations["installSource"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/reload": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Reload installed source scripts */
    post: operations["reloadSources"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get source */
    get: operations["getSource"];
    put?: never;
    post?: never;
    /** Uninstall source and clear its configuration, retaining downloads */
    delete: operations["uninstallSource"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/enabled": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["setSourceEnabled"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/search-options": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getSourceSearchOptions"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/settings": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getSourceSettings"];
    put: operations["updateSourceSettings"];
    post?: never;
    delete: operations["clearSourceSettings"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/auth": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getSourceAuth"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/auth/login": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["loginSource"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/auth/logout": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["logoutSource"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/settings/{settingKey}/invoke": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["invokeSourceSetting"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sources/{sourceKey}/cookies": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listSourceCookies"];
    put: operations["importSourceCookies"];
    post?: never;
    delete: operations["clearSourceCookies"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/search": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["aggregatedSearch"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/search/{sourceKey}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["searchSource"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/comics/{sourceKey}/{comicId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getComicDetails"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/comics/{sourceKey}/detail": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getComicDetailsByQuery"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/comics/{sourceKey}/{comicId}/episodes/{episodeId}/pages": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getEpisodePages"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/comics/{sourceKey}/pages": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getEpisodePagesByQuery"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/image": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getImage"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listDownloads"];
    put?: never;
    post: operations["createDownload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/events": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["subscribeDownloads"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getDownload"];
    put?: never;
    post?: never;
    delete: operations["deleteDownload"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/items": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listDownloadItems"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/items/page": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listDownloadItemsPage"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/items/retry": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["retryDownloadImage"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/items/retry-failed": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["retryFailedDownloadImages"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/cancel": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["cancelDownload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/pause": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["pauseDownload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/resume": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["resumeDownload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/rerun": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["rerunDownload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/downloads/{taskId}/cbz": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["downloadCbz"];
    put?: never;
    post: operations["exportDownloadCbz"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/settings/cache": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getCacheStats"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/settings/cache/images": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["clearImageCache"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/settings/cache/images/prune": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["pruneImageCache"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/debug/runtime/compatibility": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getRuntimeCompatibility"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/debug/runtime/diagnostics": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getRuntimeDiagnostics"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/debug/{sourceKey}/search": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["debugSearch"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/debug/{sourceKey}/comics/{comicId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["debugComicDetails"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/debug/{sourceKey}/comics/{comicId}/episodes/{episodeId}/pages": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["debugEpisodePages"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/debug/{sourceKey}/image": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["debugImage"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/session": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getSession"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/login": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Requires Origin equal to AUTH_ORIGIN; only available in required mode. No public account creation. */
    post: operations["login"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/logout": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["logout"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/password": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["changePassword"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/tokens": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listApiTokens"];
    put?: never;
    post: operations["createApiToken"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/tokens/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["revokeApiToken"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    Ok: {
      ok: boolean;
    };
    Health: {
      ok: boolean;
      name: string;
    };
    ApiError: {
      error: {
        code: string;
        message: string;
        details?: unknown;
        requestId?: string;
      };
    };
    RepositorySource: {
      key?: string;
      name?: string;
      version?: string;
      url?: string;
      filename?: string;
      fileName?: string;
    } & {
      [key: string]: unknown;
    };
    SourceRepository: {
      url: string;
      sources: components["schemas"]["RepositorySource"][];
    };
    SourceSummary: {
      key: string;
      name: string;
      version?: string;
      url?: string;
      filePath?: string;
      hasSearch?: boolean;
      hasComic?: boolean;
      capabilities?: {
        search: boolean;
        details: boolean;
        pages: boolean;
        settings: boolean;
        authentication: boolean;
      };
      searchOptions?: {
        label: string;
        type?: string;
        options: string[];
        default?: unknown;
      }[];
    };
    SourceMetadata: {
      key: string;
      name: string;
      version?: string;
      canUninstall?: boolean;
      enabled: number;
      script_path?: string;
      script_url?: string;
      hash?: string;
      installed_at?: string;
      updated_at?: string;
    };
    SourceAuth: {
      loggedIn: boolean;
      methods: ("password" | "cookies")[];
      cookieFields: string[];
      /** @enum {string} */
      webview: "unavailable" | "unsupported";
      registerUrl?: string;
    };
    SourceLogin:
      | {
          /** @enum {string} */
          method: "password";
          username: string;
          password: string;
        }
      | {
          /** @enum {string} */
          method: "cookies";
          values: string[];
        };
    SourceSettingDefinition: {
      title?: string;
      /** @enum {string} */
      type?: "input" | "select" | "switch" | "callback";
      default?: unknown;
      options?: (
        | string
        | {
            value: unknown;
            text?: string;
          }
      )[];
      validator?: string | null;
      buttonText?: string;
    };
    SourceSettings: {
      schema: {
        [key: string]: components["schemas"]["SourceSettingDefinition"];
      };
      values: {
        [key: string]: unknown;
      };
    };
    Comic: {
      sourceKey?: string;
      id: string;
      title: string;
      cover?: string;
      subtitle?: string;
      tags?: string[];
      description?: string;
      language?: string;
      stars?: number;
    } & {
      [key: string]: unknown;
    };
    SearchResult: {
      comics: components["schemas"]["Comic"][];
      maxPage?: number;
      next?: string | null;
    };
    AggregatedSearchItem: {
      sourceKey: string;
      sourceName: string;
      result?: components["schemas"]["SearchResult"];
      error?: string;
    };
    ComicDetails: components["schemas"]["Comic"] &
      ({
        comicId?: string;
        chapters?: {
          [key: string]: string;
        };
        thumbnails?: string[];
      } & {
        [key: string]: unknown;
      });
    EpisodePages: {
      images: string[];
    };
    CreateDownloadRequest: {
      sourceKey: string;
      comicId: string;
      episodeId?: string;
      all?: boolean;
    };
    DownloadLog: {
      time: string;
      phase: string;
      message: string;
    };
    DownloadTask: {
      id: string;
      sourceKey: string;
      comicId: string;
      episodeId: string;
      all?: boolean;
      title?: string;
      /** @enum {string} */
      status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
      phase: string;
      total: number;
      /** @description False while chapter discovery is incomplete. Total counts discovered pages; omit for legacy tasks with a known total. */
      totalKnown?: boolean;
      completed: number;
      error?: string;
      errorCode?: string;
      recovered?: boolean;
      current?: string;
      outputDir?: string;
      logs: components["schemas"]["DownloadLog"][];
      createdAt: string;
      updatedAt: string;
    } & {
      [key: string]: unknown;
    };
    DownloadItemsPage: {
      items: components["schemas"]["DownloadItem"][];
      /** @description Record count after applying failedOnly. */
      total: number;
      /** @description Task-wide count of records with failed status, regardless of filtering or page. */
      failedTotal: number;
      offset: number;
      limit: number;
    };
    DownloadItem: {
      id: string;
      task_id: string;
      image_key: string;
      file_path?: string | null;
      status: string;
      retry_count: number;
      error?: string | null;
      error_code?: string | null;
      updated_at: string;
    };
    RetryFailedDownloadImagesResult: {
      task: components["schemas"]["DownloadTask"] | null;
      retried: number;
      results: {
        imageKey: string;
        ok: boolean;
        item?: components["schemas"]["DownloadItem"];
        error?: string;
      }[];
    };
    CacheStats: {
      files: number;
      bytes: number;
    };
    RuntimeCompatibilityItem: {
      area: string;
      api: string;
      status: string;
      note?: string;
    };
    RuntimeDiagnostic: {
      time: string;
      sourceKey?: string;
      operation: string;
      code: string;
      message: string;
    };
    RuntimeDiagnostics: {
      isolation: string;
      loadedSources: components["schemas"]["SourceSummary"][];
      failedLoads: components["schemas"]["RuntimeDiagnostic"][];
      recentErrors: components["schemas"]["RuntimeDiagnostic"][];
      sourceConcurrency: {
        sourceKey: string;
        active: number;
        queued: number;
      }[];
    };
    DebugResult: {
      ok: boolean;
      name: string;
      durationMs: number;
      summary?: unknown;
      error?: string;
      hint?: string;
      stack?: string[];
    } & {
      [key: string]: unknown;
    };
    AuthSession: {
      /** @enum {string} */
      mode: "none" | "required";
      authenticated: boolean;
      initialized: boolean;
      username?: string;
      csrfToken?: string;
      /** @description Unix milliseconds */
      expiresAt?: number;
    };
    LoginRequest: {
      username: string;
      password: string;
    };
    ChangePasswordRequest: {
      oldPassword: string;
      newPassword: string;
    };
    ApiToken: {
      /** Format: uuid */
      id: string;
      name: string;
      /** Format: int64 */
      createdAt: number;
      expiresAt: number | null;
    };
    CreateApiTokenRequest: {
      name: string;
      expiresAt?: number | null;
    };
    CreateApiTokenResult: {
      /** @description Shown once. Store securely; never available from the list endpoint. */
      token: string;
      entry: components["schemas"]["ApiToken"];
    };
  };
  responses: {
    /** @description Download is busy, being deleted, or not completed for CBZ export. */
    DownloadConflict: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["ApiError"];
      };
    };
    /** @description API error */
    Error: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["ApiError"];
      };
    };
  };
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getHealthLegacy: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Health"];
        };
      };
    };
  };
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Health"];
        };
      };
    };
  };
  getOpenApi: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          };
        };
      };
    };
  };
  getSourceRepository: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceRepository"];
        };
      };
    };
  };
  refreshSourceRepository: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            sources: components["schemas"]["RepositorySource"][];
          };
        };
      };
    };
  };
  listSources: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSummary"][];
        };
      };
    };
  };
  listAvailableSources: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["RepositorySource"][];
        };
      };
    };
  };
  listInstalledSources: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSummary"][];
        };
      };
    };
  };
  listSourceMetadata: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceMetadata"][];
        };
      };
    };
  };
  installSource: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          source: string;
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          };
        };
      };
      400: components["responses"]["Error"];
    };
  };
  reloadSources: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          };
        };
      };
    };
  };
  getSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSummary"] | null;
        };
      };
    };
  };
  uninstallSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            ok: boolean;
          };
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["Error"];
    };
  };
  setSourceEnabled: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          enabled: boolean;
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceMetadata"];
        };
      };
      404: components["responses"]["Error"];
    };
  };
  getSourceSearchOptions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          }[];
        };
      };
    };
  };
  getSourceSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSettings"];
        };
      };
    };
  };
  updateSourceSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          values: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSettings"];
        };
      };
    };
  };
  clearSourceSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSettings"];
        };
      };
    };
  };
  getSourceAuth: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceAuth"];
        };
      };
      /** @description Invalid input or unsupported source capability */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Source login failed */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  loginSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SourceLogin"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceAuth"];
        };
      };
      /** @description Invalid input or unsupported source capability */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Source login failed */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  logoutSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceAuth"];
        };
      };
      /** @description Invalid input or unsupported source capability */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Source login failed */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  invokeSourceSetting: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
        settingKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SourceSettings"];
        };
      };
      /** @description Invalid input or unsupported source capability */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Source login failed */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listSourceCookies: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          }[];
        };
      };
    };
  };
  importSourceCookies: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uri */
          url: string;
          cookies?: (
            | string
            | {
                [key: string]: unknown;
              }
          )[];
          text?: string;
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          }[];
        };
      };
    };
  };
  clearSourceCookies: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Ok"];
        };
      };
    };
  };
  aggregatedSearch: {
    parameters: {
      query: {
        keyword: string;
        sources?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AggregatedSearchItem"][];
        };
      };
      400: components["responses"]["Error"];
    };
  };
  searchSource: {
    parameters: {
      query: {
        keyword: string;
        page?: string;
        next?: string;
        options?: string;
      };
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SearchResult"];
        };
      };
      400: components["responses"]["Error"];
    };
  };
  getComicDetails: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
        comicId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ComicDetails"];
        };
      };
    };
  };
  getComicDetailsByQuery: {
    parameters: {
      query: {
        comicId: string;
      };
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ComicDetails"];
        };
      };
    };
  };
  getEpisodePages: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
        comicId: string;
        episodeId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["EpisodePages"];
        };
      };
    };
  };
  getEpisodePagesByQuery: {
    parameters: {
      query: {
        comicId: string;
        episodeId: string;
      };
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["EpisodePages"];
        };
      };
    };
  };
  getImage: {
    parameters: {
      query: {
        sourceKey: string;
        imageKey: string;
        comicId?: string;
        episodeId?: string;
        thumbnail?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Image bytes */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "image/*": string;
          "application/octet-stream": string;
        };
      };
    };
  };
  listDownloads: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"][];
        };
      };
    };
  };
  createDownload: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateDownloadRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  subscribeDownloads: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Server-sent events stream */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getDownload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      404: components["responses"]["Error"];
    };
  };
  deleteDownload: {
    parameters: {
      query?: {
        files?: boolean;
      };
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      404: components["responses"]["Error"];
      503: components["responses"]["Error"];
    };
  };
  listDownloadItems: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadItem"][];
        };
      };
      404: components["responses"]["Error"];
    };
  };
  listDownloadItemsPage: {
    parameters: {
      query?: {
        offset?: number;
        limit?: number;
        failedOnly?: boolean;
      };
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Paginated image records, ordered by record id. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadItemsPage"];
        };
      };
      400: components["responses"]["Error"];
      404: components["responses"]["Error"];
    };
  };
  retryDownloadImage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          imageKey: string;
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            task: components["schemas"]["DownloadTask"];
            item: components["schemas"]["DownloadItem"];
          };
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  retryFailedDownloadImages: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["RetryFailedDownloadImagesResult"];
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  cancelDownload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  pauseDownload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  resumeDownload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  rerunDownload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DownloadTask"];
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  downloadCbz: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description CBZ archive */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/zip": string;
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  exportDownloadCbz: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        taskId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            taskId: string;
            path: string;
          };
        };
      };
      404: components["responses"]["Error"];
      409: components["responses"]["DownloadConflict"];
      503: components["responses"]["Error"];
    };
  };
  getCacheStats: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["CacheStats"];
        };
      };
    };
  };
  clearImageCache: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["CacheStats"];
        };
      };
    };
  };
  pruneImageCache: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["CacheStats"];
        };
      };
    };
  };
  getRuntimeCompatibility: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            items: components["schemas"]["RuntimeCompatibilityItem"][];
          };
        };
      };
    };
  };
  getRuntimeDiagnostics: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["RuntimeDiagnostics"];
        };
      };
    };
  };
  debugSearch: {
    parameters: {
      query?: {
        keyword?: string;
        page?: string;
      };
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DebugResult"];
        };
      };
    };
  };
  debugComicDetails: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
        comicId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DebugResult"];
        };
      };
    };
  };
  debugEpisodePages: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sourceKey: string;
        comicId: string;
        episodeId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DebugResult"];
        };
      };
    };
  };
  debugImage: {
    parameters: {
      query: {
        imageKey: string;
        comicId?: string;
        episodeId?: string;
      };
      header?: never;
      path: {
        sourceKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DebugResult"];
        };
      };
    };
  };
  getSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AuthSession"];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      429: components["responses"]["Error"];
    };
  };
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["LoginRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AuthSession"];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      429: components["responses"]["Error"];
    };
  };
  logout: {
    parameters: {
      query?: never;
      header: {
        "X-CSRF-Token": string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Ok"];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      429: components["responses"]["Error"];
    };
  };
  changePassword: {
    parameters: {
      query?: never;
      header: {
        "X-CSRF-Token": string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ChangePasswordRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Ok"];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      429: components["responses"]["Error"];
    };
  };
  listApiTokens: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiToken"][];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      404: components["responses"]["Error"];
    };
  };
  createApiToken: {
    parameters: {
      query?: never;
      header: {
        "X-CSRF-Token": string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateApiTokenRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["CreateApiTokenResult"];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      404: components["responses"]["Error"];
    };
  };
  revokeApiToken: {
    parameters: {
      query?: never;
      header: {
        "X-CSRF-Token": string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Ok"];
        };
      };
      400: components["responses"]["Error"];
      401: components["responses"]["Error"];
      403: components["responses"]["Error"];
      404: components["responses"]["Error"];
    };
  };
}
