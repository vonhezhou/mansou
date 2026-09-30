import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createStorage, type DownloadTask } from "@venera/storage";
import { readConfig } from "../config/config.js";
import { createPaths } from "../storage/paths.js";
const config = readConfig();
const paths = createPaths(config.dataDir);

const command = process.argv[2];
const target = process.argv[3];

if (command === "import-json") {
  await importJsonData();
} else if (command === "backup") {
  await backup(target);
} else if (command === "restore") {
  await restore(target);
} else {
  console.log("Usage: pnpm --filter @venera/server storage <import-json|backup|restore> [file]");
  process.exit(command ? 1 : 0);
}

async function importJsonData() {
  const storage = createStorage(config.dataDir);
  try {
    if (existsSync(paths.sourceData)) {
      for (const file of await readdir(paths.sourceData)) {
        if (!file.endsWith(".json")) continue;
        const sourceKey = path.basename(file, ".json");
        const data = JSON.parse(
          await readFile(path.join(paths.sourceData, file), "utf8"),
        ) as Record<string, unknown>;
        for (const [key, value] of Object.entries(data)) {
          if (key === "settings")
            storage.setSourceSettings(sourceKey, value as Record<string, unknown>);
          else storage.setPluginData(sourceKey, key, value);
        }
      }
    }
    if (existsSync(paths.cookies)) {
      for (const file of await readdir(paths.cookies)) {
        if (!file.endsWith(".json")) continue;
        const sourceKey = path.basename(file, ".json");
        storage.setCookieJar(
          sourceKey,
          JSON.parse(await readFile(path.join(paths.cookies, file), "utf8")),
        );
      }
    }
    if (existsSync(paths.downloadTasks)) {
      const tasks = JSON.parse(await readFile(paths.downloadTasks, "utf8")) as DownloadTask[];
      storage.saveDownloads(tasks);
    }
  } finally {
    storage.close();
  }
}

async function backup(
  file = path.join(config.dataDir, "backups", `venera_web-${Date.now()}.sqlite`),
) {
  await mkdir(path.dirname(file), { recursive: true });
  await copyFile(dbPath(), file);
  console.log(file);
}

async function restore(file?: string) {
  if (!file) throw new Error("restore requires a backup file path");
  await mkdir(config.dataDir, { recursive: true });
  await copyFile(file, dbPath());
}

function dbPath() {
  return path.join(config.dataDir, "venera_web.sqlite");
}
