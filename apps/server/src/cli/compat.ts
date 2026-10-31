import { writeFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { readConfig } from "../config/config.js";
import { buildApp, initializeApp } from "../app.js";
const config = readConfig();

type CompatResult = {
  source: string;
  install: string;
  search: string;
  details: string;
  pages: string;
  image: string;
  download: string;
  notes: string[];
};

type DownloadProbeResult = {
  status: string;
  phase?: string;
  error?: string;
  errorCode?: string;
  logs?: Array<Record<string, unknown>>;
};

const args = parseArgs(process.argv.slice(2));
const sources = splitList(
  args.source ??
    args.sources ??
    args._[0] ??
    "default:baozi,default:Komiic,default:comick,default:manga_dex,default:ykmh",
);
const keyword = args.keyword ?? "one";
const isolation = "worker";
if (args.isolation !== undefined)
  throw new Error("--isolation has been removed; plugins always run in Workers.");
const output = args.output;
const format = args.format ?? (output?.endsWith(".md") ? "markdown" : "json");
const verifyDownload = args.download === "true" || args.download === true;
const downloadTimeoutMs = Number(args.downloadTimeoutMs ?? 180000);

if (args.help || sources.length === 0) {
  console.log(
    "Usage: MANSOU_DATA_DIR=/tmp/mansou-compat pnpm --filter @mansou/server compat -- --source=default:baozi,default:comick --keyword=one --download=true --output=result.md --format=markdown",
  );
  process.exit(args.help ? 0 : 1);
}

const result = await run();
const rendered =
  format === "markdown" ? renderMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, rendered, "utf8");
else process.stdout.write(rendered);

async function run() {
  const built = await buildApp();
  try {
    await initializeApp(built.context);
    const results: CompatResult[] = [];
    for (const source of sources) results.push(await verifySource(built.app, source));
    return { isolation, keyword, dataDir: config.dataDir, download: verifyDownload, results };
  } finally {
    await built.app.close();
  }
}

async function verifySource(app: FastifyInstance, source: string): Promise<CompatResult> {
  const result: CompatResult = {
    source,
    install: "pending",
    search: "pending",
    details: "pending",
    pages: "pending",
    image: "pending",
    download: verifyDownload ? "pending" : "skipped",
    notes: [],
  };
  const loaded = await app.inject({ method: "GET", url: `/api/v1/sources/${enc(source)}` });
  if (loaded.statusCode === 200 && loaded.json()) {
    result.install = "loaded";
  } else {
    const install = await app.inject({
      method: "POST",
      url: "/api/v1/sources/install",
      payload: { source },
    });
    result.install = status(install.statusCode);
    if (install.statusCode !== 200) return note(result, install.body);
  }

  const search = await app.inject({
    method: "GET",
    url: `/api/v1/search/${enc(source)}?keyword=${enc(keyword)}&page=1`,
  });
  result.search = status(search.statusCode);
  if (search.statusCode !== 200) return note(result, search.body);
  const comicId = search.json().comics?.[0]?.id;
  if (!comicId) {
    result.search = "fail empty";
    return result;
  }

  const detail = await app.inject({
    method: "GET",
    url: `/api/v1/comics/${enc(source)}/detail?comicId=${enc(comicId)}`,
  });
  result.details = status(detail.statusCode);
  if (detail.statusCode !== 200) return note(result, detail.body);
  const episodeId = firstEpisode(detail.json());

  const pages = await app.inject({
    method: "GET",
    url: `/api/v1/comics/${enc(source)}/pages?comicId=${enc(comicId)}&episodeId=${enc(episodeId)}`,
  });
  result.pages = status(pages.statusCode);
  if (pages.statusCode !== 200) return note(result, pages.body);
  const imageKey = pages.json().images?.[0];
  if (!imageKey) {
    result.pages = "fail empty";
    return result;
  }

  const image = await app.inject({
    method: "GET",
    url: `/api/v1/debug/${enc(source)}/image?comicId=${enc(comicId)}&episodeId=${enc(episodeId)}&imageKey=${enc(imageKey)}`,
  });
  const imageBody = image.json();
  result.image = image.statusCode === 200 && imageBody.ok ? "pass" : `fail ${image.statusCode}`;
  if (!imageBody.ok) note(result, JSON.stringify(imageBody));

  if (verifyDownload) {
    const download = await app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      payload: { sourceKey: source, comicId, episodeId },
    });
    result.download = status(download.statusCode);
    if (download.statusCode !== 200) return note(result, download.body);
    const taskId = download.json().id;
    const completed = await waitForDownload(app, taskId);
    result.download = completed.status === "completed" ? "pass" : `fail ${completed.status}`;
    if (completed.status !== "completed") {
      note(
        result,
        JSON.stringify({
          errorCode: completed.errorCode,
          error: completed.error,
          phase: completed.phase,
          logs: completed.logs?.slice(-5),
        }),
      );
    }
  }
  return result;
}

async function waitForDownload(app: FastifyInstance, taskId: string): Promise<DownloadProbeResult> {
  const deadline = Date.now() + downloadTimeoutMs;
  let last: DownloadProbeResult = { status: "unknown" };
  while (Date.now() < deadline) {
    const response = await app.inject({ method: "GET", url: `/api/v1/downloads/${enc(taskId)}` });
    if (response.statusCode !== 200)
      return { status: `http_${response.statusCode}`, error: response.body };
    last = response.json() as DownloadProbeResult;
    if (["completed", "failed", "cancelled", "paused"].includes(String(last.status))) return last;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await app.inject({ method: "POST", url: `/api/v1/downloads/${enc(taskId)}/cancel` });
  return {
    ...last,
    status: "timeout",
    error: `Download did not finish within ${downloadTimeoutMs}ms`,
  };
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
  return result as {
    _: string[];
    source?: string;
    sources?: string;
    keyword?: string;
    isolation?: string;
    output?: string;
    format?: "json" | "markdown";
    download?: string | boolean;
    downloadTimeoutMs?: string;
    help?: boolean;
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function renderMarkdown(result: {
  isolation: string;
  keyword: string;
  dataDir: string;
  download: boolean;
  results: CompatResult[];
}) {
  const lines = [
    `# Source Compatibility`,
    ``,
    `- isolation: ${result.isolation}`,
    `- keyword: ${result.keyword}`,
    `- dataDir: ${result.dataDir}`,
    `- download: ${result.download}`,
    ``,
    `| 源 | 安装 | 搜索 | 详情 | 章节 | 图片 | 下载 | 备注 |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...result.results.map(
      (item) =>
        `| ${item.source} | ${item.install} | ${item.search} | ${item.details} | ${item.pages} | ${item.image} | ${item.download} | ${item.notes.join("<br>").replace(/\|/g, "\\|")} |`,
    ),
    ``,
  ];
  return lines.join("\n");
}
