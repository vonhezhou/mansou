import path from "node:path";
import { accessSync, constants, mkdirSync } from "node:fs";
import type { StorageDatabase } from "@mansou/storage";
import { AppError } from "../errors.js";

export class DownloadDirectory {
  constructor(
    private readonly storage: StorageDatabase,
    private readonly fallback: string,
  ) {}

  settings() {
    return { downloadDir: this.storage.getSetting<string>("downloadDir") ?? this.fallback };
  }

  resolve(value?: string) {
    const directory = value?.trim() || this.settings().downloadDir;
    if (!path.isAbsolute(directory) || directory.includes("\0"))
      throw new AppError("INVALID_DOWNLOAD_DIRECTORY", "请填写服务器上的绝对目录路径");
    const normalized = path.resolve(directory);
    try {
      mkdirSync(normalized, { recursive: true });
      accessSync(normalized, constants.W_OK);
    } catch {
      throw new AppError("INVALID_DOWNLOAD_DIRECTORY", "下载目录无法创建或写入");
    }
    return normalized;
  }

  save(value: string) {
    const directory = this.resolve(value);
    this.storage.setSetting("downloadDir", directory);
    return this.settings();
  }
}
