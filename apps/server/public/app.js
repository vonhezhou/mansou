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
  return `/api/image?${params}`;
}

async function loadSources() {
  state.sources = await api("/api/sources");
  const select = $("#source");
  select.innerHTML = state.sources
    .filter((source) => source.hasSearch)
    .map((source) => `<option value="${source.key}">${source.name}</option>`)
    .join("");
  renderSources();
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

async function search(event) {
  event?.preventDefault();
  const sourceKey = $("#source").value;
  const keyword = $("#keyword").value.trim();
  if (!sourceKey || !keyword) return;
  $("#results").innerHTML = "加载中...";
  const result = await api(`/api/search/${sourceKey}?keyword=${encodeURIComponent(keyword)}&page=1`);
  $("#results").innerHTML = result.comics
    .map(
      (comic) => `
        <article class="card" data-comic-id="${comic.id}" data-source-key="${sourceKey}">
          <img src="${imageUrl(sourceKey, comic.cover, comic.id, "", true)}" loading="lazy" />
          <div class="card-body">
            <h3>${comic.title}</h3>
            <div class="muted">${comic.subtitle || comic.description || comic.id}</div>
          </div>
        </article>
      `,
    )
    .join("");
}

async function openDetail(sourceKey, comicId) {
  const detail = await api(`/api/comics/${sourceKey}/${encodeURIComponent(comicId)}`);
  state.currentDetail = { ...detail, sourceKey, comicId };
  const chapters = detail.chapters || { _default: "默认章节" };
  $("#detail").innerHTML = `
    <img class="cover" src="${imageUrl(sourceKey, detail.cover, comicId, "", true)}" />
    <div>
      <h2>${detail.title}</h2>
      <p>${detail.description || ""}</p>
      <div class="actions">
        <button id="download-all">下载全部章节</button>
      </div>
      <div class="chapters">
        ${Object.entries(chapters)
          .map(([id, title]) => `<button data-episode-id="${id}">${title}</button><button data-download-episode-id="${id}">下载</button>`)
          .join("")}
      </div>
    </div>
  `;
  show("detail");
}

async function createDownload(body) {
  const task = await postJson("/api/downloads", body);
  alert(`已创建下载任务: ${task.id}`);
  await loadDownloads();
}

async function openReader(episodeId) {
  const { sourceKey, comicId } = state.currentDetail;
  const pages = await api(`/api/comics/${sourceKey}/${encodeURIComponent(comicId)}/episodes/${encodeURIComponent(episodeId)}/pages`);
  $("#reader").innerHTML = pages.images
    .map((imageKey) => `<img src="${imageUrl(sourceKey, imageKey, comicId, episodeId)}" loading="lazy" />`)
    .join("");
  show("reader");
}

async function loadDownloads() {
  const tasks = await api("/api/downloads");
  $("#downloads").innerHTML = tasks
    .slice()
    .reverse()
    .map(
      (task) => `
        <div class="list-item">
          <strong>${task.title || task.comicId}</strong>
          <div class="muted">${task.sourceKey} / ${task.status} / ${task.completed}/${task.total}</div>
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
  const downloadButton = event.target.closest("button[data-download-episode-id]");
  if (downloadButton) {
    const { sourceKey, comicId } = state.currentDetail;
    void createDownload({ sourceKey, comicId, episodeId: downloadButton.dataset.downloadEpisodeId });
  }
  if (event.target.closest("#download-all")) {
    const { sourceKey, comicId } = state.currentDetail;
    void createDownload({ sourceKey, comicId, all: true });
  }
});
$("#downloads").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-task-action]");
  if (!button) return;
  const id = button.dataset.taskId;
  const action = button.dataset.taskAction;
  if (action === "cancel") await postJson(`/api/downloads/${id}/cancel`);
  if (action === "rerun") await postJson(`/api/downloads/${id}/rerun`);
  if (action === "cbz") {
    const result = await postJson(`/api/downloads/${id}/cbz`);
    alert(`CBZ: ${result.path}`);
  }
  if (action === "delete") await fetch(`/api/downloads/${id}`, { method: "DELETE" });
  if (action === "delete-files") await fetch(`/api/downloads/${id}?files=true`, { method: "DELETE" });
  await loadDownloads();
});
$("#back-to-search").addEventListener("click", () => show("search"));
$("#back-to-detail").addEventListener("click", () => show("detail"));
$("#refresh-downloads").addEventListener("click", loadDownloads);
$("#refresh-sources").addEventListener("click", loadSources);

await loadSources();
startDownloadsAutoRefresh();
