import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// 用真实服务进程和本地站点验收恢复行为，不替换调度器、规则解析或存储。
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const chapters = Number(value("--chapters", "1000"));
assert(
  Number.isInteger(chapters) && chapters >= 20 && chapters <= 50000,
  "chapters 必须为 20–50000",
);
const soakMinutes = Number(value("--soak-minutes", "0"));
assert(
  Number.isFinite(soakMinutes) && soakMinutes >= 0 && soakMinutes <= 120,
  "soak-minutes 必须为 0–120",
);
const output = path.resolve(
  value("--output", path.join(tmpdir(), "mansou-novel-verification.json")),
);
const entry = path.resolve(value("--server-entry", path.join(root, "apps/server/dist/server.js")));
const dataDir = await mkdtemp(path.join(tmpdir(), "mansou-novels-acceptance-"));
const backupDir = `${dataDir}-restored`;
let activeDataDir = dataDir;
const exec = promisify(execFile);
const milestone = {
  pause: Math.floor(chapters * 0.1),
  kill: Math.floor(chapters * 0.25),
  fail: Math.floor(chapters * 0.45),
};
const requested = [];
const health = [];
const samples = [];
const events = [];
const started = performance.now();
const report = {
  startedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  chapters,
  milestone,
  events,
};
let fixtureUrl,
  current,
  failedOnce = false,
  monitoring = false;
const body = (chapter, page) =>
  `第 ${chapter} 章第 ${page} 页正文。${"合成长篇验收内容。".repeat(64)}`;
const chapterText = (chapter) =>
  body(chapter, 1) + (chapter % 10 === 0 ? `\n${body(chapter, 2)}` : "");
const expected = () =>
  `合成长篇\n作者：验收夹具\n\n` +
  Array.from({ length: chapters }, (_, i) => `第 ${i + 1} 章\n\n${chapterText(i + 1)}\n\n`).join(
    "",
  );
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = (stage, details = {}) => {
  const event = { stage, elapsedMs: Math.round(performance.now() - started), ...details };
  events.push(event);
  console.log(JSON.stringify(event));
};
function source() {
  return {
    bookSourceName: "合成长篇验收源",
    bookSourceUrl: fixtureUrl,
    searchUrl: "/search?q={{key}}",
    ruleSearch: { bookList: ".book", name: "a@text", author: ".author@text", bookUrl: "a@href" },
    ruleBookInfo: { tocUrl: ".toc@href" },
    ruleToc: {
      chapterList: ".chapter",
      chapterName: "text",
      chapterUrl: "href",
      nextTocUrl: ".next@href",
    },
    ruleContent: { content: ".content@html", nextContentUrl: ".next@href" },
  };
}
const fixture = createServer((req, res) => {
  const url = new URL(req.url, "http://fixture");
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (url.pathname === "/sources") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify([source()]));
  }
  if (url.pathname === "/search")
    return res.end(
      '<div class="book"><a href="/book">合成长篇</a><span class="author">作者：验收夹具</span></div>',
    );
  if (url.pathname === "/book") return res.end('<a class="toc" href="/toc/0">目录</a>');
  if (url.pathname.startsWith("/toc/")) {
    const page = Number(url.pathname.split("/")[2]),
      start = page * 50 + 1,
      end = Math.min(chapters, start + 49);
    let html = start > 1 ? `<a class="chapter" href="/chapter/${start - 1}">重复目录项</a>` : "";
    for (let chapter = start; chapter <= end; chapter++)
      html += `<a class="chapter" href="/chapter/${chapter}">第 ${chapter} 章</a>`;
    html += '<div class="chapter"> &nbsp; </div>';
    if (end < chapters) html += `<a class="next" href="/toc/${page + 1}">下一页</a>`;
    return res.end(html);
  }
  const chapter = /^\/chapter\/(\d+)(\/2)?$/.exec(url.pathname);
  if (chapter) {
    const index = Number(chapter[1]),
      page = chapter[2] ? 2 : 1;
    requested.push({ chapter: index, page });
    if (index === milestone.fail && page === 1 && !failedOnce) {
      failedOnce = true;
      res.statusCode = 503;
      return res.end("故障注入：仅失败一次");
    }
    const next =
      page === 1 && index % 10 === 0
        ? `/chapter/${index}/2`
        : index < chapters
          ? `/chapter/${index + 1}`
          : undefined;
    return res.end(
      `<div class="content">${body(index, page)}</div>${next ? `<a class="next" href="${next}">继续</a>` : ""}`,
    );
  }
  res.statusCode = 404;
  res.end("not found");
});
async function startServer() {
  const child = spawn(process.execPath, [entry], {
    cwd: path.resolve(path.dirname(entry), ".."),
    env: {
      ...process.env,
      AUTH_MODE: "none",
      AUTH_ORIGIN: "",
      HOST: "127.0.0.1",
      PORT: "0",
      MANSOU_DATA_DIR: activeDataDir,
      MANSOU_ACCESS_TOKEN: "",
      MANSOU_PROXY: "",
      MANSOU_NO_PROXY: "*",
      MANSOU_DOWNLOAD_RETRIES: "1",
      MANSOU_DOWNLOAD_TASK_CONCURRENCY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const server = { child, logs: [], url: "", exit: once(child, "exit") };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("服务启动超过 30 秒"));
    }, 30000);
    const append = (chunk) => {
      server.logs.push(chunk.toString());
      if (server.logs.length > 40) server.logs.shift();
      const found = chunk.toString().match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/);
      if (found) {
        clearTimeout(timer);
        server.url = found[1];
        resolve();
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`服务提前退出：${server.logs.join("")}`));
    });
  });
  current = server;
  return server;
}
async function stopServer(signal = "SIGTERM") {
  const server = current;
  current = undefined;
  if (!server) return;
  server.child.kill(signal);
  await Promise.race([
    server.exit,
    delay(10000, undefined, { ref: false }).then(() => {
      if (server.child.exitCode === null && server.child.signalCode === null) {
        server.child.kill("SIGKILL");
        throw new Error("服务未在 10 秒内关闭");
      }
    }),
  ]);
}
async function api(route, body, method = body === undefined ? "GET" : "POST") {
  assert(current, "服务未启动");
  const response = await fetch(`${current.url}/api/v1${route}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert(response.ok, `${route}: HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}
async function waitTask(id, predicate, label) {
  const deadline = Date.now() + 15 * 60000;
  while (Date.now() < deadline) {
    const tasks = await api("/novels/downloads");
    const task = tasks.find((task) => task.id === id);
    if (predicate(task)) return task;
    if (["failed", "cancelled", "completed"].includes(task.status))
      throw new Error(`${label} 期间任务提前终止：${JSON.stringify(task)}`);
    await delay(100);
  }
  throw new Error(`${label} 等待超时`);
}
const monitor = setInterval(async () => {
  if (monitoring || !current) return;
  monitoring = true;
  const server = current,
    at = performance.now();
  try {
    const response = await fetch(`${server.url}/health`, { signal: AbortSignal.timeout(5000) });
    if (current === server) health.push({ ms: performance.now() - at, status: response.status });
    const { stdout } = await exec("ps", ["-o", "rss=", "-p", String(server.child.pid)]);
    if (current === server)
      samples.push({
        elapsedMs: performance.now() - started,
        rssMiB: Number(stdout.trim()) / 1024,
      });
  } catch (error) {
    if (current === server) health.push({ error: error.message });
  } finally {
    monitoring = false;
  }
}, 1000);
try {
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
  await startServer();
  const imported = await api("/novels/subscriptions", {
    name: "验收订阅",
    url: `${fixtureUrl}/sources`,
  });
  const sourceId = imported.sources[0].id;
  const search = await api("/novels/search", { keyword: "合成长篇", sourceIds: [sourceId] });
  assert.equal(search.results[0].name, "合成长篇");
  const task = await api("/novels/downloads", {
    sourceId,
    book: { name: "合成长篇", author: "验收夹具", bookUrl: `${fixtureUrl}/book` },
    all: true,
  });
  record("started", { taskId: task.id });
  await waitTask(task.id, (task) => task.completed >= milestone.pause, "暂停阈值");
  const paused = await api(`/novels/downloads/${task.id}/pause`, {});
  assert.equal(paused.status, "paused");
  record("paused", { completed: paused.completed });
  await api(`/novels/downloads/${task.id}/resume`, {});
  await waitTask(task.id, (task) => task.completed >= milestone.kill, "强制退出阈值");
  await stopServer("SIGKILL");
  const directory = path.join(dataDir, "downloads/novels", task.id);
  const cached = (await readdir(directory))
    .filter((name) => /^\d+\.txt$/.test(name))
    .map((name) => Number.parseInt(name, 10) + 1)
    .sort((a, b) => a - b);
  assert(cached.length >= milestone.kill);
  const lost = cached[Math.floor(cached.length / 2)];
  await unlink(path.join(directory, `${lost - 1}.txt`));
  const checkpoint = new Set(cached.filter((index) => index !== lost)),
    beforeRestart = requested.length;
  record("killed", { cached: cached.length, removedChapterCache: lost });
  await startServer();
  const failed = await waitTask(task.id, (task) => task.status === "failed", "故障注入");
  assert.match(failed.error, /503/);
  record("failed-as-expected", { completed: failed.completed });
  const unavailable = await fetch(`${current.url}/api/v1/novels/downloads/${task.id}/txt`);
  assert.equal(unavailable.status, 409);
  await unavailable.body?.cancel();
  await api(`/novels/downloads/${task.id}/resume`, {});
  const completed = await waitTask(task.id, (task) => task.status === "completed", "完整下载");
  assert.equal(completed.completed, chapters);
  assert.equal(completed.total, chapters);
  const txt = await fetch(`${current.url}/api/v1/novels/downloads/${task.id}/txt`);
  assert.equal(txt.status, 200);
  const downloaded = Buffer.from(await txt.arrayBuffer()),
    expectedText = expected();
  assert.equal(digest(downloaded), digest(expectedText), "TXT 必须与完整有序正文逐字节一致");
  const repeated = requested
    .slice(beforeRestart)
    .filter((request) => checkpoint.has(request.chapter));
  assert.deepEqual(repeated, [], "重启后不能重抓已有完整章节");
  assert(
    requested.slice(beforeRestart).some((request) => request.chapter === lost),
    "丢失章节缓存必须重抓",
  );
  assert.equal(
    requested.filter((request) => request.chapter === milestone.fail && request.page === 1).length,
    2,
  );
  assert(samples.length > 0, "必须取得实际 RSS 样本");
  assert(health.length > 0);
  assert(
    health.every((value) => value.status === 200),
    "运行中健康检查必须持续可用",
  );
  const latencies = health.map((value) => value.ms).sort((a, b) => a - b);
  Object.assign(report, {
    passed: true,
    completed: completed.completed,
    bytes: downloaded.length,
    sha256: digest(downloaded),
    elapsedMs: Math.round(performance.now() - started),
    downloadElapsedMs: Math.round(performance.now() - started),
    chapterRequests: requested.length,
    restoredCachedChapters: checkpoint.size,
    lostCacheRefetched: lost,
    rssPeakMiB: Math.max(...samples.map((sample) => sample.rssMiB)),
    health: {
      samples: health.length,
      p95Ms: latencies[Math.floor((latencies.length - 1) * 0.95)],
      maxMs: latencies.at(-1),
    },
    resourceSamples: samples,
  });
  record("completed", { bytes: downloaded.length, sha256: report.sha256 });
  await stopServer();
  await cp(dataDir, backupDir, { recursive: true });
  await rm(dataDir, { recursive: true, force: true });
  activeDataDir = backupDir;
  await startServer();
  const restored = (await api("/novels/downloads")).find((value) => value.id === task.id);
  assert.equal(restored.status, "completed");
  assert.equal((await api("/novels/sources")).sources[0].hash, imported.sources[0].hash);
  const restoredTxt = await fetch(`${current.url}/api/v1/novels/downloads/${task.id}/txt`);
  assert.equal(restoredTxt.status, 200);
  assert.equal(digest(Buffer.from(await restoredTxt.arrayBuffer())), report.sha256);
  report.backupRestore = { passed: true, newDataDirectory: true, sha256: report.sha256 };
  record("backup-restored");
  if (soakMinutes > 0) {
    const soakStarted = performance.now(),
      deadline = soakStarted + soakMinutes * 60000;
    let cycles = 0,
      cancellations = 0,
      retries = 0;
    report.soak = { requestedMinutes: soakMinutes, running: true, cycles, cancellations, retries };
    while (performance.now() < deadline) {
      cycles++;
      await api(
        `/novels/subscriptions/${imported.subscriptions.find((group) => group.id !== "local").id}/refresh`,
        {},
      );
      if (cycles % 5 === 0) failedOnce = false;
      let work = await api("/novels/downloads", {
        sourceId,
        book: {
          name: "合成长篇",
          author: "验收夹具",
          bookUrl: `${fixtureUrl}/book?cycle=${cycles}`,
        },
        all: true,
      });
      if (cycles % 3 === 0) {
        await waitTask(work.id, (task) => task.completed >= milestone.pause, "持续运行取消阈值");
        const cancelled = await api(`/novels/downloads/${work.id}/cancel`, {});
        assert.equal(cancelled.status, "cancelled");
        await api(`/novels/downloads/${work.id}`, undefined, "DELETE");
        cancellations++;
        work = await api("/novels/downloads", {
          sourceId,
          book: {
            name: "合成长篇",
            author: "验收夹具",
            bookUrl: `${fixtureUrl}/book?cycle=${cycles}-retry`,
          },
          all: true,
        });
      }
      let result = await waitTask(
        work.id,
        (task) => ["failed", "completed"].includes(task.status),
        "持续运行下载",
      );
      if (result.status === "failed") {
        assert.match(result.error, /503/);
        retries++;
        await api(`/novels/downloads/${work.id}/resume`, {});
        result = await waitTask(work.id, (task) => task.status === "completed", "持续运行重试");
      }
      assert.equal(result.completed, chapters);
      const response = await fetch(`${current.url}/api/v1/novels/downloads/${work.id}/txt`);
      assert.equal(response.status, 200);
      assert.equal(digest(Buffer.from(await response.arrayBuffer())), report.sha256);
      await api(`/novels/downloads/${work.id}`, undefined, "DELETE");
      assert(
        health.every((value) => value.status === 200),
        "持续运行期间健康检查不可失败",
      );
      const soakSamples = samples.filter((sample) => sample.elapsedMs >= soakStarted - started);
      report.soak = {
        requestedMinutes: soakMinutes,
        elapsedMs: Math.round(performance.now() - soakStarted),
        running: true,
        cycles,
        cancellations,
        retries,
        rssPeakMiB: Math.max(...soakSamples.map((sample) => sample.rssMiB)),
      };
      report.resourceSamples = samples;
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
      record("soak-cycle", { cycles, cancellations, retries, elapsedMs: report.soak.elapsedMs });
      await delay(Math.min(5000, Math.max(0, deadline - performance.now())));
    }
    assert(
      health.every((sample) => sample.status === 200),
      "持续运行期间健康检查不可失败",
    );
    const resources = samples.filter((sample) => sample.elapsedMs >= soakStarted - started);
    const mean = (values) =>
      values.reduce((sum, sample) => sum + sample.rssMiB, 0) / Math.max(1, values.length);
    report.soak.rssFirstMinuteMiB = mean(
      resources.filter((sample) => sample.elapsedMs < soakStarted - started + 60000),
    );
    report.soak.rssLastMinuteMiB = mean(
      resources.filter((sample) => sample.elapsedMs > performance.now() - started - 60000),
    );
    report.soak.running = false;
    report.soak.elapsedMs = Math.round(performance.now() - soakStarted);
    report.elapsedMs = Math.round(performance.now() - started);
    record("soak-completed", report.soak);
  }
} catch (error) {
  Object.assign(report, { passed: false, error: error.stack, logs: current?.logs });
  process.exitCode = 1;
  console.error(error);
} finally {
  clearInterval(monitor);
  try {
    await stopServer();
  } catch (error) {
    report.passed = false;
    report.shutdownError = error.message;
    process.exitCode = 1;
  }
  fixture.closeAllConnections();
  fixture.close();
  await Promise.all([
    rm(dataDir, { recursive: true, force: true }),
    rm(backupDir, { recursive: true, force: true }),
  ]);
  if (samples.length) report.rssPeakMiB = Math.max(...samples.map((sample) => sample.rssMiB));
  if (health.length) {
    const values = health
      .filter((sample) => sample.status === 200)
      .map((sample) => sample.ms)
      .sort((a, b) => a - b);
    report.health = {
      samples: health.length,
      failures: health.filter((sample) => sample.status !== 200).length,
      p95Ms: values[Math.floor((values.length - 1) * 0.95)],
      maxMs: values.at(-1),
    };
  }
  report.elapsedMs = Math.round(performance.now() - started);
  report.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      report: output,
      passed: report.passed,
      chapters,
      elapsedMs: report.elapsedMs,
    }),
  );
}
