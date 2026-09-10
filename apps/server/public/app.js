const state = {
  sources: [],
  currentDetail: null,
  downloadsTimer: null,
};

const $ = (selector) => document.querySelector(selector);

function show(view) {
  document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
  $(`#${view}-view`).classList.add("active");
}

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function postJson(path, body) {
  return api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

function imageUrl(sourceKey, imageKey, comicId = "", episodeId = "", thumbnail = false) {
  const params = new URLSearchParams({ sourceKey, imageKey });
  if (comicId) params.set("comicId", comicId);
  if (episodeId) params.set("episodeId", episodeId);
  if (thumbnail) params.set("thumbnail", "true");
  return `/api/v1/image?${params}`;
}

async function loadSources() {
  state.sources = await api("/api/v1/sources");
  const searchableSources = state.sources.filter((source) => source.hasSearch);
  $("#search-sources").innerHTML = searchableSources.length
    ? searchableSources
        .map(
          (source, index) => `
            <label class="source-option">
              <input type="checkbox" name="search-source" value="${source.key}" ${index === 0 ? "checked" : ""} />
              <span>${source.name}</span>
              <span class="muted">${source.key}</span>
            </label>
          `,
        )
        .join("")
    : `<span class="muted">没有可搜索的源</span>`;
  renderSources();
}

function selectedSearchSources() {
  return [...document.querySelectorAll('input[name="search-source"]:checked')].map(
    (input) => input.value,
  );
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function sourceName(sourceKey) {
  return state.sources.find((source) => source.key === sourceKey)?.name ?? sourceKey;
}

function taskScope(task) {
  if (task.all || task.episodeId === "__all__") return "全本";
  return task.episodeId === "_default" ? "首章" : `章节 ${task.episodeId}`;
}

async function createDownloads(requests) {
  const created = [];
  for (const body of requests) {
    created.push(await postJson("/api/v1/downloads", body));
  }
  alert(`已创建 ${created.length} 个下载任务`);
  await loadDownloads();
}

function firstChapterId(chapters) {
  return Object.keys(chapters)[0] ?? "_default";
}

function selectedChapterIds() {
  return [...document.querySelectorAll('input[name="download-chapter"]:checked')].map(
    (input) => input.value,
  );
}

function downloadChapterBody(sourceKey, comicId, episodeId) {
  return episodeId === "_default" ? { sourceKey, comicId } : { sourceKey, comicId, episodeId };
}

function renderSources() {
  $("#sources").innerHTML = state.sources
    .map(
      (source) => `
        <div class="list-item">
          <strong>${source.name}</strong>
          <div class="muted">${source.key} / ${source.version}</div>
          <div class="muted">search: ${source.hasSearch ? "yes" : "no"}, comic: ${source.hasComic ? "yes" : "no"}</div>
        </div>
      `,
    )
    .join("");
}

async function runAggregatedSearch(keyword, sourceKeys) {
  const params = new URLSearchParams({ keyword, sources: sourceKeys.join(",") });
  const groups = await api(`/api/v1/search?${params}`);
  return groups.flatMap((group) => {
    if (group.error)
      return [
        {
          type: "error",
          sourceKey: group.sourceKey,
          sourceName: group.sourceName,
          error: group.error,
        },
      ];
    return (group.result?.comics ?? []).map((comic) => ({
      ...comic,
      type: "comic",
      sourceKey: group.sourceKey,
      sourceName: group.sourceName,
    }));
  });
}

async function loadSingleSourceSearch(sourceKey, keyword) {
  const result = await api(
    `/api/v1/search/${sourceKey}?keyword=${encodeURIComponent(keyword)}&page=1`,
  );
  return result.comics.map((comic) => ({
    ...comic,
    type: "comic",
    sourceKey,
    sourceName: sourceName(sourceKey),
  }));
}

function renderSearchResults(items) {
  if (items.length === 0) {
    $("#results").innerHTML = `<div class="muted">没有结果</div>`;
    return;
  }
  $("#results").innerHTML = items
    .map((item) => {
      if (item.type === "error") {
        return `
          <article class="card error-card">
            <div class="card-body">
              <h3>${item.sourceName}</h3>
              <div class="muted">${item.sourceKey}</div>
              <div class="muted">${item.error}</div>
            </div>
          </article>
        `;
      }
      return `
        <article class="card" data-comic-id="${item.id}" data-source-key="${item.sourceKey}">
          <img src="${imageUrl(item.sourceKey, item.cover, item.id, "", true)}" loading="lazy" />
          <div class="card-body">
            <div class="source-badge">${item.sourceName}</div>
            <h3>${item.title}</h3>
            <div class="muted">${item.subtitle || item.description || item.id}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function search(event) {
  event?.preventDefault();
  const sourceKeys = selectedSearchSources();
  const keyword = $("#keyword").value.trim();
  if (!keyword) return;
  if (sourceKeys.length === 0) {
    $("#results").innerHTML = `<div class="muted">请至少选择一个源</div>`;
    return;
  }
  $("#results").innerHTML = "加载中...";
  const items =
    sourceKeys.length === 1
      ? await loadSingleSourceSearch(sourceKeys[0], keyword)
      : await runAggregatedSearch(keyword, sourceKeys);
  renderSearchResults(items);
}

async function openDetail(sourceKey, comicId) {
  const detail = await api(`/api/v1/comics/${sourceKey}/${encodeURIComponent(comicId)}`);
  state.currentDetail = { ...detail, sourceKey, comicId };
  const chapters = detail.chapters || { _default: "默认章节" };
  $("#detail").innerHTML = `
    <img class="cover" src="${imageUrl(sourceKey, detail.cover, comicId, "", true)}" />
    <div>
      <h2>${detail.title}</h2>
      <p>${detail.description || ""}</p>
      <div class="actions">
        <button id="download-first">只下载首章</button>
        <button id="download-selected">下载所选章节</button>
        <button id="download-all">下载全本</button>
      </div>
      <div class="chapters">
        ${Object.entries(chapters)
          .map(
            ([id, title]) => `
            <label class="chapter-option">
              <input type="checkbox" name="download-chapter" value="${id}" />
              <span>${title}</span>
            </label>
            <button data-episode-id="${id}">阅读</button>
          `,
          )
          .join("")}
      </div>
    </div>
  `;
  show("detail");
}

async function openReader(episodeId) {
  const { sourceKey, comicId } = state.currentDetail;
  const pages = await api(
    `/api/v1/comics/${sourceKey}/${encodeURIComponent(comicId)}/episodes/${encodeURIComponent(episodeId)}/pages`,
  );
  $("#reader").innerHTML = pages.images
    .map(
      (imageKey) =>
        `<img src="${imageUrl(sourceKey, imageKey, comicId, episodeId)}" loading="lazy" />`,
    )
    .join("");
  show("reader");
}

async function loadDownloads() {
  const tasks = await api("/api/v1/downloads");
  $("#downloads").innerHTML = tasks
    .slice()
    .reverse()
    .map(
      (task) => `
        <div class="list-item">
          <strong>${task.title || task.comicId}</strong>
          <div class="muted">${sourceName(task.sourceKey)} (${task.sourceKey}) / ${task.status} / ${task.completed}/${task.total}</div>
          <div class="meta-grid">
            <span>任务 ID: ${task.id}</span>
            <span>漫画 ID: ${task.comicId}</span>
            <span>范围: ${taskScope(task)}</span>
            <span>创建: ${formatTime(task.createdAt)}</span>
          </div>
          <div class="muted">${task.outputDir || ""}</div>
          ${task.error ? `<div class="muted">${task.error}</div>` : ""}
          <div class="actions">
            <button data-task-action="cancel" data-task-id="${task.id}">取消</button>
            <button data-task-action="rerun" data-task-id="${task.id}">重跑</button>
            <button data-task-action="cbz" data-task-id="${task.id}">导出 CBZ</button>
            <button data-task-action="delete" data-task-id="${task.id}">删除</button>
            <button data-task-action="delete-files" data-task-id="${task.id}">删除+文件</button>
          </div>
        </div>
      `,
    )
    .join("");
}

function startDownloadsAutoRefresh() {
  if (state.downloadsTimer) clearInterval(state.downloadsTimer);
  state.downloadsTimer = setInterval(() => {
    if ($("#downloads-view").classList.contains("active") && $("#auto-refresh-downloads").checked) {
      void loadDownloads();
    }
  }, 2000);
}

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    show(button.dataset.view);
    if (button.dataset.view === "downloads") loadDownloads();
  });
});

$("#search-form").addEventListener("submit", search);
$("#results").addEventListener("click", (event) => {
  const card = event.target.closest(".card");
  if (card) openDetail(card.dataset.sourceKey, card.dataset.comicId);
});
$("#detail").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-episode-id]");
  if (button) openReader(button.dataset.episodeId);
  if (event.target.closest("#download-first")) {
    const { sourceKey, comicId, chapters } = state.currentDetail;
    void createDownloads([
      downloadChapterBody(sourceKey, comicId, firstChapterId(chapters || { _default: "默认章节" })),
    ]);
  }
  if (event.target.closest("#download-selected")) {
    const { sourceKey, comicId } = state.currentDetail;
    const episodeIds = selectedChapterIds();
    if (episodeIds.length === 0) {
      alert("请先选择章节");
      return;
    }
    void createDownloads(
      episodeIds.map((episodeId) => downloadChapterBody(sourceKey, comicId, episodeId)),
    );
  }
  if (event.target.closest("#download-all")) {
    const { sourceKey, comicId } = state.currentDetail;
    void createDownloads([{ sourceKey, comicId, all: true }]);
  }
});
$("#downloads").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-task-action]");
  if (!button) return;
  const id = button.dataset.taskId;
  const action = button.dataset.taskAction;
  if (action === "cancel") await postJson(`/api/v1/downloads/${id}/cancel`);
  if (action === "rerun") await postJson(`/api/v1/downloads/${id}/rerun`);
  if (action === "cbz") {
    const result = await postJson(`/api/v1/downloads/${id}/cbz`);
    alert(`CBZ: ${result.path}`);
  }
  if (action === "delete") await fetch(`/api/v1/downloads/${id}`, { method: "DELETE" });
  if (action === "delete-files")
    await fetch(`/api/v1/downloads/${id}?files=true`, { method: "DELETE" });
  await loadDownloads();
});
$("#back-to-search").addEventListener("click", () => show("search"));
$("#back-to-detail").addEventListener("click", () => show("detail"));
$("#refresh-downloads").addEventListener("click", loadDownloads);
$("#refresh-sources").addEventListener("click", loadSources);

await loadSources();
startDownloadsAutoRefresh();
