import path from "node:path";

export function createPaths(dataDir: string) {
  return {
    data: dataDir,
    repositoryIndex: path.join(dataDir, "sources", "index.json"),
    scripts: path.join(dataDir, "sources", "scripts"),
    sourceData: path.join(dataDir, "source-data"),
    cookies: path.join(dataDir, "cookies"),
    imageCache: path.join(dataDir, "cache", "images"),
    downloads: path.join(dataDir, "downloads"),
    downloadTasks: path.join(dataDir, "downloads", "tasks.json"),
  };
}
export type AppPaths = ReturnType<typeof createPaths>;
