import path from "node:path";
import { config } from "../config/config.js";

export const paths = {
  data: config.dataDir,
  repositoryIndex: path.join(config.dataDir, "sources", "index.json"),
  scripts: path.join(config.dataDir, "sources", "scripts"),
  sourceData: path.join(config.dataDir, "source-data"),
  cookies: path.join(config.dataDir, "cookies"),
  imageCache: path.join(config.dataDir, "cache", "images"),
  downloads: path.join(config.dataDir, "downloads"),
  downloadTasks: path.join(config.dataDir, "downloads", "tasks.json"),
  bundledMockSource: path.join(process.cwd(), "fixtures", "sources", "mock.js"),
};
