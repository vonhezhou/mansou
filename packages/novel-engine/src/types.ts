export interface BookSource {
  bookSourceUrl: string;
  bookSourceName: string;
  bookSourceType?: number;
  enabled?: boolean;
  searchUrl?: string;
  header?: string;
  jsLib?: string;
  loginUrl?: string;
  loginUi?: string;
  loginCheckJs?: string;
  mainJs?: string;
  concurrentRate?: string;
  ruleSearch?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RegisteredSource {
  id: string;
  source: BookSource;
  supported: boolean;
  reason?: string;
}

export interface SearchBook {
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  intro?: string;
  kind?: string;
  lastChapter?: string;
  wordCount?: string;
}

export interface BookOrigin extends SearchBook {
  sourceId: string;
  sourceName: string;
}

export interface AggregatedBook {
  name: string;
  author: string;
  origins: BookOrigin[];
}

export type ErrorCode =
  | "UNSUPPORTED_RULE"
  | "SOURCE_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "HTTP_ERROR"
  | "RESPONSE_TOO_LARGE"
  | "CHALLENGE"
  | "PARSE_MISMATCH";

export class SourceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export interface SourceOutcome {
  sourceId: string;
  sourceName: string;
  status: "ok" | "error";
  elapsedMs: number;
  books: SearchBook[];
  error?: { code: ErrorCode; message: string };
}
