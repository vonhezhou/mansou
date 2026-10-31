import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createApplication } from "../apps/server/dist/application.js";
import { readConfig } from "../apps/server/dist/config/config.js";
import { readAuthConfig } from "../apps/server/dist/auth/config.js";

// 只读取用户提供的书源快照；报告保存统计与摘要，不保存或内置第三方正文。
const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const sourceFile = value("--sources");
assert(sourceFile, "需要 --sources 指定用户提供的书源 JSON 快照");
const output = path.resolve(value("--output", path.join(tmpdir(), "mansou-novel-sources.json")));
const timeoutMs = Number(value("--timeout-ms", "15000"));
assert(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60000);
const input = await readFile(sourceFile);
assert(input.length <= 8 * 1024 * 1024, "书源快照不能超过 8 MiB");
const nativeFetch = globalThis.fetch;
let nextRequestAt = 0;
globalThis.fetch = async (input, options) => {
  const now = performance.now(),
    wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(nextRequestAt, now) + 1000;
  await delay(wait, undefined, { signal: options?.signal });
  return nativeFetch(input, options);
};
const dataDir = await mkdtemp(path.join(tmpdir(), "mansou-source-verification-"));
const config = { ...readConfig(), dataDir, requestTimeoutMs: timeoutMs };
const context = createApplication(config, readAuthConfig({ AUTH_MODE: "none" }), (error) =>
  console.error(error),
);
const report = {
  startedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  snapshot: {
    filename: path.basename(sourceFile),
    sha256: createHash("sha256").update(input).digest("hex"),
  },
  keyword: "凡人",
  timeoutMs,
  networkMinIntervalMs: 1000,
  sources: [],
};
async function save() {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
try {
  await context.initialize();
  const state = context.novelSources.import(JSON.parse(input.toString()));
  assert(state.sources.length <= 20, "低频在线复核每次最多 20 个源");
  for (const source of state.sources) {
    const result = {
      name: source.name,
      url: source.url,
      ruleHash: source.hash,
      searchSupported: source.searchSupported,
      downloadSupported: source.downloadSupported,
      stage: "search",
      samples: [],
    };
    report.sources.push(result);
    try {
      console.log(JSON.stringify({ source: source.name, stage: "search" }));
      const searched = await context.novelSources.search(report.keyword, 1, [source.id]);
      const outcome = searched.sources[0];
      if (outcome.status !== "ok")
        throw Object.assign(new Error(outcome.error.message), { code: outcome.error.code });
      result.search = { status: outcome.status, books: outcome.books.length };
      assert(outcome.books.length > 0, "常见关键词没有返回书籍，不能认定搜索有效");
      if (!source.downloadSupported)
        throw Object.assign(new Error(source.downloadError), { code: "UNSUPPORTED_RULE" });
      result.stage = "catalog";
      const book = outcome.books[0];
      result.book = { name: book.name, author: book.author, url: book.bookUrl };
      const catalog = await context.novelSources.catalog(source.id, book.bookUrl);
      result.catalog = {
        complete: catalog.tocComplete,
        pages: catalog.tocPages,
        chapters: catalog.chapters.length,
      };
      assert(catalog.tocComplete, "目录未遍历完，中后章节尚未验证");
      result.stage = "content";
      const indexes = [
        ...new Set([0, Math.floor(catalog.chapters.length / 2), catalog.chapters.length - 1]),
      ];
      for (const index of indexes) {
        await delay(1000);
        const chapter = catalog.chapters[index];
        result.pendingChapter = { index: index + 1, title: chapter.title };
        const body = await context.novelEngine.execute("chapter", [
          context.novelSources.source(source.id).raw,
          chapter,
          catalog,
        ]);
        result.samples.push({
          index: index + 1,
          title: chapter.title,
          characters: body.length,
          sha256: createHash("sha256").update(body).digest("hex"),
        });
      }
      delete result.pendingChapter;
      result.passed = true;
      result.stage = "completed";
    } catch (error) {
      result.passed = false;
      result.error = { code: error.code ?? "VERIFICATION_ERROR", message: error.message };
    }
    console.log(
      JSON.stringify({
        source: source.name,
        stage: result.stage,
        passed: result.passed,
        error: result.error,
      }),
    );
    await save();
    await delay(1000);
  }
  report.passed = report.sources.every((source) => source.passed);
  if (!report.passed) process.exitCode = 1;
} finally {
  await context.close();
  globalThis.fetch = nativeFetch;
  await rm(dataDir, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ report: output, passed: report.passed }));
}
