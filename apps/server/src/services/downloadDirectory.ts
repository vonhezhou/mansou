import path from "node:path";
import { accessSync, constants, mkdirSync, realpathSync } from "node:fs";
import type { StorageDatabase } from "@mansou/storage";
import type { components } from "@mansou/contracts";
import { AppError } from "../errors.js";

type Settings = components["schemas"]["DownloadSettings"];
type Destination = components["schemas"]["DownloadTask"]["destination"];

function contains(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function canonical(directory: string) {
  try {
    return realpathSync(directory);
  } catch {
    return path.resolve(directory);
  }
}

function assertSeparate(publicDir: string, personalDir: string) {
  if (contains(publicDir, personalDir) || contains(personalDir, publicDir))
    throw new AppError(
      "INVALID_DOWNLOAD_DIRECTORY",
      "公共目录与个人目录必须独立，不能相同或互相包含",
    );
}

export class DownloadDirectory {
  constructor(
    private readonly storage: StorageDatabase,
    private readonly fallback: string,
  ) {}

  settings(): Settings {
    const saved = this.storage.getSetting<Settings>("downloadDestinations");
    if (saved) return saved;
    const publicDir = this.storage.getSetting<string>("downloadDir") ?? this.fallback;
    return {
      publicDir,
      personalDir: path.join(path.dirname(publicDir), `${path.basename(publicDir)}-personal`),
      defaultDestination: "public",
    };
  }

  private directory(value: string) {
    const directory = value.trim();
    if (!path.isAbsolute(directory) || directory.includes("\0"))
      throw new AppError("INVALID_DOWNLOAD_DIRECTORY", "请填写服务器上的绝对目录路径");
    try {
      mkdirSync(directory, { recursive: true });
      accessSync(directory, constants.W_OK);
      return realpathSync(directory);
    } catch {
      throw new AppError("INVALID_DOWNLOAD_DIRECTORY", "下载目录无法创建或写入");
    }
  }

  private validate(settings: Settings): Settings {
    const publicDir = this.directory(settings.publicDir);
    const personalDir = this.directory(settings.personalDir);
    assertSeparate(publicDir, personalDir);
    return { publicDir, personalDir, defaultDestination: settings.defaultDestination };
  }

  resolve(value?: string, destination?: Destination) {
    // 已创建任务使用固定路径，不能重新根据当前设置选择目的地。
    if (value) return this.directory(value);
    const settings = this.settings();
    const selected = destination ?? settings.defaultDestination;
    if (selected !== "public" && selected !== "personal")
      throw new AppError("INVALID_DOWNLOAD_DESTINATION", "请选择公共或个人目的地");
    const publicDir =
      selected === "public" ? this.directory(settings.publicDir) : canonical(settings.publicDir);
    const personalDir =
      selected === "personal"
        ? this.directory(settings.personalDir)
        : canonical(settings.personalDir);
    assertSeparate(publicDir, personalDir);
    return selected === "personal" ? personalDir : publicDir;
  }

  classify(value: string): Destination {
    const settings = this.settings();
    // 只读识别历史任务，不创建目录或检查写权限。
    const directory = canonical(value);
    const publicMatch = contains(canonical(settings.publicDir), directory);
    const personalMatch = contains(canonical(settings.personalDir), directory);
    if (publicMatch === personalMatch) return "custom";
    return personalMatch ? "personal" : "public";
  }

  save(value: Settings) {
    const settings = this.validate(value);
    this.storage.setSetting("downloadDestinations", settings);
    return settings;
  }
}
