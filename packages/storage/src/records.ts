export type DownloadStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type DownloadPhase =
  | "queued"
  | "loading_details"
  | "loading_pages"
  | "downloading_images"
  | "writing_metadata"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type DownloadTask = {
  id: string;
  sourceKey: string;
  comicId: string;
  episodeId: string;
  all?: boolean;
  title?: string;
  status: DownloadStatus;
  phase: DownloadPhase;
  total: number;
  completed: number;
  error?: string;
  errorCode?: string;
  recovered?: boolean;
  current?: string;
  logs: Array<{ time: string; phase: DownloadPhase; message: string }>;
  outputDir?: string;
  createdAt: string;
  updatedAt: string;
};

export type DownloadItem = {
  id: string;
  task_id: string;
  image_key: string;
  file_path: string | null;
  status: string;
  retry_count: number;
  error: string | null;
  error_code: string | null;
  updated_at: string;
};
export type SourceRecord = {
  key: string;
  name: string;
  version: string | null;
  enabled: number;
  script_path: string | null;
  script_url: string | null;
  hash: string | null;
  installed_at: string | null;
  updated_at: string | null;
};
