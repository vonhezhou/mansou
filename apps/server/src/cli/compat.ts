import { writeFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { config } from "../config/config.js";
import { buildApp, initializeApp } from "../app.js";

type CompatResult = {
  source: string;
  install: string;
  search: string;
  details: string;
  pages: string;
  image: string;
  notes: string[];
};

const args = parseArgs(process.argv.slice(2));
const sources = splitList(args.source ?? args.sources ?? args._[0] ?? "baozi,Komiic,comick,manga_dex,ykmh");
const keyword = args.keyword ?? "one";
const isolation = args.isolation ?? config.pluginIsolation;
const output = args.output;
const format = args.format ?? (output?.endsWith(".md") ? "markdown" : "json");

if (args.help || sources.length === 0) {
  console.log("Usage: VENERA_DATA_DIR=/tmp/venera-compat pnpm --filter @venera/server compat:worker -- --source=baozi,comick --keyword=one --output=result.md --format=markdown");
  process.exit(args.help ? 0 : 1);
}

config.pluginIsolation = isolation;

const result = await run();
const rendered = format === "markdown" ? renderMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, rendered, "utf8");
else process.stdout.write(rendered);

async function run() {
  const built = await buildApp();
  try {
    await initializeApp(built.context);
    const results: CompatResult[] = [];
    for (const source of sources) results.push(await verifySource(built.app, source));
    return { isolation, keyword, dataDir: config.dataDir, results };
  } finally {
    await built.app.close();
  }
}

async function verifySource(app: FastifyInstance, source: string): Promise<CompatResult> {
  const result: CompatResult = { source, install: "pending", search: "pending", details: "pending", pages: "pending", image: "pending", notes: [] };
  const loaded = await app.inject({ method: "GET", url: `/api/v1/sources/${enc(source)}` });
  if (loaded.statusCode === 200 && loaded.json()) {
    result.install = "loaded";
  } else {
    const install = await app.inject({ method: "POST", url: "/api/v1/sources/install", payload: { source } });
    result.install = status(install.statusCode);
    if (install.statusCode !== 200) return note(result, install.body);
  }

  const search = await app.inject({ method: "GET", url: `/api/v1/search/${enc(source)}?keyword=${enc(keyword)}&page=1` });
  result.search = status(search.statusCode);
  if (search.statusCode !== 200) return note(result, search.body);
  const comicId = search.json().comics?.[0]?.id;
  if (!comicId) {
    result.search = "fail empty";
    return result;
  }

  const detail = await app.inject({ method: "GET", url: `/api/v1/comics/${enc(source)}/detail?comicId=${enc(comicId)}` });
  result.details = status(detail.statusCode);
  if (detail.statusCode !== 200) return note(result, detail.body);
  const episodeId = firstEpisode(detail.json());

  const pages = await app.inject({ method: "GET", url: `/api/v1/comics/${enc(source)}/pages?comicId=${enc(comicId)}&episodeId=${enc(episodeId)}` });
  result.pages = status(pages.statusCode);
  if (pages.statusCode !== 200) return note(result, pages.body);
  const imageKey = pages.json().images?.[0];
  if (!imageKey) {
    result.pages = "fail empty";
    return result;
  }

  const image = await app.inject({ method: "GET", url: `/api/v1/debug/${enc(source)}/image?comicId=${enc(comicId)}&episodeId=${enc(episodeId)}&imageKey=${enc(imageKey)}` });
  const imageBody = image.json();
  result.image = image.statusCode === 200 && imageBody.ok ? "pass" : `fail ${image.statusCode}`;
  if (!imageBody.ok) note(result, JSON.stringify(imageBody));
  return result;
}

function parseArgs(values: string[]) {
  const result: Record<string, string | boolean | string[]> & { _: string[] } = { _: [] };
  for (const value of values) {
    if (!value.startsWith("--")) result._.push(value);
    else {
      const [key, item] = value.slice(2).split("=", 2);
      result[key] = item ?? true;
    }
  }
  return result as { _: string[]; source?: string; sources?: string; keyword?: string; isolation?: string; output?: string; format?: "json" | "markdown"; help?: boolean };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function status(code: number) {
  return code === 200 ? "pass" : `fail ${code}`;
}

function note(result: CompatResult, body: string) {
  result.notes.push(body.slice(0, 500));
  return result;
}

function enc(value: unknown) {
  return encodeURIComponent(String(value));
}

function firstEpisode(details: { chapters?: Record<string, string> }) {
  const keys = Object.keys(details.chapters ?? {});
  return keys.find((key) => key !== "No Volume" && key !== "_default") ?? keys[0] ?? "_default";
}

function renderMarkdown(result: { isolation: string; keyword: string; dataDir: string; results: CompatResult[] }) {
  const lines = [
    `# Source Compatibility`,
    ``,
    `- isolation: ${result.isolation}`,
    `- keyword: ${result.keyword}`,
    `- dataDir: ${result.dataDir}`,
    ``,
    `| 源 | 安装 | 搜索 | 详情 | 章节 | 图片 | 备注 |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...result.results.map((item) => `| ${item.source} | ${item.install} | ${item.search} | ${item.details} | ${item.pages} | ${item.image} | ${item.notes.join("<br>").replace(/\|/g, "\\|")} |`),
    ``,
  ];
  return lines.join("\n");
}
