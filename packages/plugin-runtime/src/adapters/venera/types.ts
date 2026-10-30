import type { SearchResult } from "@mansou/core";
export type VeneraComicSource = {
  translate?: (text: string) => string;
  key: string;
  name: string;
  version: string;
  url?: string;
  minAppVersion?: string;
  settings?: Record<string, unknown>;
  account?: {
    login?: (username: string, password: string) => unknown | Promise<unknown>;
    logout?: () => unknown | Promise<unknown>;
    loginWithCookies?: {
      fields: string[];
      validate: (values: string[]) => boolean | Promise<boolean>;
    };
    loginWithWebview?: { url?: string };
    registerWebsite?: string;
  };
  search?: {
    optionList?: Array<{
      label: string;
      type?: string;
      options: string[];
      default?: unknown;
    }>;
    load?: (
      keyword: string,
      options: string[],
      page: number,
    ) => Promise<SearchResult> | SearchResult;
    loadNext?: (
      keyword: string,
      options: string[],
      next?: string | null,
    ) => Promise<SearchResult> | SearchResult;
  };
  comic?: {
    loadInfo?: (id: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
    loadEp?: (
      id: string,
      ep?: string | null,
    ) => Promise<{ images: string[] }> | { images: string[] };
    getImageLoadingConfig?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    onImageLoad?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    onLoadFailed?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
      error: Error,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    onResponse?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
      response: Record<string, unknown>,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    modifyImage?: (
      imageKey: string,
      comicId: string,
      epId: string | null,
      data: Buffer,
    ) => Promise<unknown> | unknown;
  };
  getImageLoadingConfig?: (
    imageKey: string,
    comicId: string,
    epId: string | null,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  getThumbnailLoadingConfig?: (imageKey: string) => Record<string, unknown>;
  onLoadFailed?: (
    imageKey: string,
    comicId: string,
    epId: string | null,
    error: Error,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  onResponse?: (
    imageKey: string,
    comicId: string,
    epId: string | null,
    response: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  modifyImage?: (
    imageKey: string,
    comicId: string,
    epId: string | null,
    data: Buffer,
  ) => Promise<unknown> | unknown;
  init?: () => Promise<void> | void;
  [key: string]: unknown;
};
