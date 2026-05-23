export type RepositorySource = {
  key?: string;
  name: string;
  url?: string;
  filename?: string;
  fileName?: string;
  version: string;
  description?: string;
};

export type Comic = {
  id: string;
  title: string;
  cover: string;
  subtitle?: string;
  subTitle?: string;
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
  subTitle?: string;
  description?: string;
  tags?: Record<string, string[]>;
  chapters?: Record<string, string> | Record<string, Record<string, string>>;
  thumbnails?: string[];
  recommend?: Comic[];
  uploader?: string;
  uploadTime?: string;
  updateTime?: string;
  url?: string;
};

export type LoadedSource = {
  key: string;
  name: string;
  version: string;
  url: string;
  filePath: string;
  instance: VeneraComicSource;
};

export type VeneraComicSource = {
  key: string;
  name: string;
  version: string;
  url?: string;
  minAppVersion?: string;
  search?: {
    optionList?: Array<{
      label: string;
      type?: string;
      options: string[];
      default?: unknown;
    }>;
    load?: (keyword: string, options: string[], page: number) => Promise<SearchResult> | SearchResult;
    loadNext?: (keyword: string, options: string[], next?: string | null) => Promise<SearchResult> | SearchResult;
  };
  comic?: {
    loadInfo?: (id: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
    loadEp?: (id: string, ep?: string | null) => Promise<{ images: string[] }> | { images: string[] };
    getImageLoadingConfig?: (imageKey: string, comicId: string, epId: string | null) => Promise<Record<string, unknown>> | Record<string, unknown>;
  };
  getImageLoadingConfig?: (imageKey: string, comicId: string, epId: string | null) => Promise<Record<string, unknown>> | Record<string, unknown>;
  getThumbnailLoadingConfig?: (imageKey: string) => Record<string, unknown>;
  init?: () => Promise<void> | void;
  [key: string]: unknown;
};
