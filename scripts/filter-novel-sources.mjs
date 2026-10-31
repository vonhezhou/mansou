import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  fetchSubscription,
  MIAOGONGZI_SUBSCRIPTION_URL,
  parseSources,
  assertSupported,
  assertDownloadSupported,
} from "../packages/novel-engine/dist/index.js";
import { NovelEngineExecutor } from "../apps/server/dist/services/novels/engineExecutor.js";

const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const sourceFile = value("--sources");
const subscription = value("--subscription", MIAOGONGZI_SUBSCRIPTION_URL);
const output = path.resolve(value("--output", "data/miaogongzi-usable.json"));
const reportFile = path.resolve(value("--report", "data/miaogongzi-verification.json"));
assert.notEqual(output, reportFile, "书源输出和报告必须使用不同路径");
const timeoutMs = Number(value("--timeout-ms", "8000"));
assert(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60000);
const keyword = value("--keyword", "凡人");
const fetched = sourceFile
  ? { sources: parseSources(JSON.parse(await readFile(sourceFile, "utf8"))) }
  : await fetchSubscription(subscription, { timeoutMs });
const report = {
  startedAt: new Date().toISOString(),
  subscription: sourceFile ? undefined : subscription,
  sourceFile,
  warning: fetched.warning,
  keyword,
  timeoutMs,
  criteria: "搜索非空、完整目录、首中尾章节正文各至少 200 字；不使用 WebView",
  total: fetched.sources.length,
  sources: [],
};
const candidates = [];
for (const source of fetched.sources) {
  const row = {
    name: source.bookSourceName,
    url: source.bookSourceUrl,
    hash: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
    passed: false,
    stage: "compatibility",
  };
  report.sources.push(row);
  try {
    assertSupported(source);
    assertDownloadSupported(source);
    candidates.push({ source, row });
  } catch (error) {
    row.error = { code: error.code, message: error.message };
  }
}
const usable = [];
// 最多三源并行，全局每秒发起一次请求，避免集中请求上游。
let nextAt = 0;
const fetcher = async (input, options) => {
  const now = performance.now();
  const wait = Math.max(0, nextAt - now);
  nextAt = Math.max(nextAt, now) + 1000;
  await delay(wait, undefined, { signal: options?.signal });
  return fetch(input, options);
};
const engine = new NovelEngineExecutor(fetcher, timeoutMs);
let saving = Promise.resolve();
const save = () => {
  const sources = JSON.stringify(usable, null, 2) + "\n";
  const summary = JSON.stringify(report, null, 2) + "\n";
  saving = saving.then(async () => {
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(path.dirname(reportFile), { recursive: true });
    await writeFile(output, sources);
    await writeFile(reportFile, summary);
  });
  return saving;
};
async function verify({ source, row }) {
  try {
    row.stage = "search";
    const found = await engine.execute("search", [
      { id: row.hash, source, supported: true },
      keyword,
      1,
    ]);
    if (found.status !== "ok")
      throw Object.assign(new Error(found.error.message), { code: found.error.code });
    assert(found.books.length, "常见关键词未返回书籍");
    row.books = found.books.length;
    row.stage = "catalog";
    const catalog = await engine.execute(
      "catalog",
      [source, found.books[0].bookUrl],
      AbortSignal.timeout(45000),
    );
    assert(catalog.tocComplete && catalog.chapters.length, "目录不完整或为空");
    row.chapters = catalog.chapters.length;
    row.stage = "content";
    row.samples = [];
    for (const index of new Set([
      0,
      Math.floor(catalog.chapters.length / 2),
      catalog.chapters.length - 1,
    ])) {
      const body = await engine.execute(
        "chapter",
        [source, catalog.chapters[index], catalog],
        AbortSignal.timeout(30000),
      );
      assert(body.length >= 200, "正文不足 200 字，需人工复核");
      row.samples.push({
        index: index + 1,
        characters: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
      });
    }
    row.stage = "completed";
    row.passed = true;
    usable.push(source);
  } catch (error) {
    row.error = { code: error.code ?? "VERIFICATION_ERROR", message: error.message };
  }
  console.log(
    JSON.stringify({ name: row.name, stage: row.stage, passed: row.passed, error: row.error }),
  );
  await save();
}
try {
  console.log(JSON.stringify({ total: report.total, candidates: candidates.length }));
  await save();
  const queue = [...candidates];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) await verify(queue.shift());
    }),
  );
} finally {
  await engine.close();
  report.finishedAt = new Date().toISOString();
  report.passed = usable.length;
  await save();
  console.log(JSON.stringify({ usable: usable.length, output, report: reportFile }));
}
