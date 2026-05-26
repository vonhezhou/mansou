import { useEffect, useState, startTransition } from "react";
import { createRoot } from "react-dom/client";
import type { Comic } from "@venera/contracts";
import "./styles.css";

type Source = { key: string; name: string; version?: string; hasSearch?: boolean; hasComic?: boolean };
type RepositorySource = { key?: string; name: string; version?: string; description?: string; fileName?: string; filename?: string };
type SearchResult = { comics: Comic[]; maxPage?: number; next?: string | null };
type Details = Comic & { comicId?: string; chapters?: Record<string, string>; thumbnails?: string[] };
type DownloadTask = { id: string; title?: string; sourceKey: string; comicId: string; status: string; phase: string; total: number; completed: number; error?: string; logs?: Array<{ time: string; phase: string; message: string }> };
type DownloadItem = { image_key?: string; imageKey?: string; status: string; file_path?: string; retry_count?: number; error?: string; error_code?: string };
type CacheStats = { files: number; bytes: number };
type SettingsResponse = { schema: Record<string, { default?: unknown }>; values: Record<string, unknown> };
type SourceMetadata = { key: string; name: string; version?: string; enabled: number | boolean; script_url?: string; updated_at?: string };
type HistoryItem = { source_key?: string; sourceKey?: string; comic_id?: string; comicId?: string; episode_id?: string; episodeId?: string; page?: number; progress?: number; updated_at?: string };

const apiBase = "/api/v1";

function getAccessToken() {
  return window.localStorage.getItem("venera_access_token") ?? "";
}

function withAccessToken(url: string) {
  const token = getAccessToken();
  if (!token) return url;
  const next = new URL(url, window.location.origin);
  next.searchParams.set("access_token", token);
  return `${next.pathname}${next.search}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    ...init,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  return body as T;
}

function imageUrl(sourceKey: string, imageKey: string, comicId?: string, episodeId?: string, thumbnail = false) {
  const params = new URLSearchParams({ sourceKey, imageKey, thumbnail: String(thumbnail) });
  if (comicId) params.set("comicId", comicId);
  if (episodeId) params.set("episodeId", episodeId);
  return withAccessToken(`${apiBase}/image?${params}`);
}

function comicDetailPath(sourceKey: string, comicId: string) {
  return `/comics/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}`;
}

function episodePagesPath(sourceKey: string, comicId: string, episodeId: string) {
  return `/comics/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}/episodes/${encodeURIComponent(episodeId)}/pages`;
}

function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [availableSources, setAvailableSources] = useState<RepositorySource[]>([]);
  const [sourceKey, setSourceKey] = useState("mock");
  const [installSource, setInstallSource] = useState("");
  const [keyword, setKeyword] = useState("test");
  const [results, setResults] = useState<Comic[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [downloadItems, setDownloadItems] = useState<Record<string, DownloadItem[]>>({});
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [sourceMetadata, setSourceMetadata] = useState<SourceMetadata[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sourceSettings, setSourceSettings] = useState<SettingsResponse | null>(null);
  const [settingsJson, setSettingsJson] = useState("{}");
  const [cookieUrl, setCookieUrl] = useState("");
  const [cookieText, setCookieText] = useState("");
  const [accessToken, setAccessToken] = useState(getAccessToken());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    const events = new EventSource(withAccessToken(`${apiBase}/downloads/events`));
    events.addEventListener("downloads", (event) => setDownloads(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, [accessToken]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    await run(async () => {
      const loaded = await api<Source[]>("/sources/installed");
      const metadata = await api<SourceMetadata[]>("/sources/metadata");
      const repository = await api<RepositorySource[]>("/sources/available");
      setSources(loaded);
      setSourceMetadata(metadata);
      setAvailableSources(repository);
      if (loaded[0] && !loaded.some((source) => source.key === sourceKey)) setSourceKey(loaded[0].key);
      await loadDownloads();
      setCache(await api<CacheStats>("/settings/cache"));
      setHistory(await api<HistoryItem[]>("/library/history"));
    });
  }

  async function search() {
    await run(async () => {
      const data = await api<SearchResult>(`/search/${sourceKey}?keyword=${encodeURIComponent(keyword)}&page=1`);
      startTransition(() => {
        setResults(data.comics ?? []);
        setDetails(null);
        setImages([]);
      });
    });
  }

  async function openComic(comic: Comic) {
    await run(async () => {
      const data = await api<Details>(comicDetailPath(sourceKey, comic.id));
      const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
      setDetails(data);
      setEpisodeId(firstEpisode);
      setImages([]);
    });
  }

  async function loadSourceSettings(nextSourceKey = sourceKey) {
    await run(async () => {
      const data = await api<SettingsResponse>(`/sources/${nextSourceKey}/settings`);
      setSourceSettings(data);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function saveSourceSettings() {
    await run(async () => {
      await api(`/sources/${sourceKey}/settings`, { method: "PUT", body: JSON.stringify({ values: JSON.parse(settingsJson) }) });
      await loadSourceSettings(sourceKey);
    });
  }

  async function importCookies() {
    await run(async () => {
      const cookies = cookieText.split("\n").map((line) => line.trim()).filter(Boolean);
      await api(`/sources/${sourceKey}/cookies`, { method: "PUT", body: JSON.stringify({ url: cookieUrl, cookies }) });
      setCookieText("");
    });
  }

  async function installSelectedSource() {
    if (!installSource) return;
    await run(async () => {
      await api("/sources/install", { method: "POST", body: JSON.stringify({ source: installSource }) });
      await refresh();
    });
  }

  async function refreshRepository() {
    await run(async () => {
      const data = await api<{ sources: RepositorySource[] }>("/source-repository/refresh", { method: "POST" });
      setAvailableSources(data.sources ?? []);
    });
  }

  async function reloadSources() {
    await run(async () => {
      await api("/sources/reload", { method: "POST" });
      await refresh();
    });
  }

  async function setSourceEnabled(metadata: SourceMetadata, enabled: boolean) {
    await run(async () => {
      await api(`/sources/${encodeURIComponent(metadata.key)}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) });
      await refresh();
    });
  }

  async function readEpisode(nextEpisodeId = episodeId) {
    if (!details || !nextEpisodeId) return;
    await run(async () => {
      const data = await api<{ images: string[] }>(episodePagesPath(sourceKey, details.comicId ?? details.id, nextEpisodeId));
      setEpisodeId(nextEpisodeId);
      setImages(data.images ?? []);
      await api(`/library/history/${sourceKey}/${encodeURIComponent(details.comicId ?? details.id)}`, {
        method: "PUT",
        body: JSON.stringify({ episodeId: nextEpisodeId, page: 0, progress: 0 }),
      });
      setHistory(await api<HistoryItem[]>("/library/history"));
    });
  }

  async function createDownload(all = false) {
    if (!details) return;
    await run(async () => {
      await api<DownloadTask>("/downloads", {
        method: "POST",
        body: JSON.stringify({ sourceKey, comicId: details.comicId ?? details.id, episodeId: episodeId ?? undefined, all }),
      });
      await loadDownloads();
    });
  }

  async function loadDownloads() {
    setDownloads(await api<DownloadTask[]>("/downloads"));
  }

  async function clearCache() {
    await run(async () => setCache(await api<CacheStats>("/settings/cache/images", { method: "DELETE" })));
  }

  async function pruneCache() {
    await run(async () => setCache(await api<CacheStats>("/settings/cache/images/prune", { method: "POST" })));
  }

  async function loadDownloadItems(task: DownloadTask) {
    await run(async () => {
      const items = await api<DownloadItem[]>(`/downloads/${encodeURIComponent(task.id)}/items`);
      setDownloadItems((current) => ({ ...current, [task.id]: items }));
    });
  }

  async function retryDownloadItem(task: DownloadTask, item: DownloadItem) {
    const imageKey = item.imageKey ?? item.image_key;
    if (!imageKey) return;
    await run(async () => {
      await api(`/downloads/${encodeURIComponent(task.id)}/items/retry`, { method: "POST", body: JSON.stringify({ imageKey }) });
      await loadDownloadItems(task);
      await loadDownloads();
    });
  }

  async function downloadAction(task: DownloadTask, action: "cancel" | "rerun" | "cbz" | "delete" | "delete-files") {
    await run(async () => {
      if (action === "cancel") await api(`/downloads/${task.id}/cancel`, { method: "POST" });
      if (action === "rerun") await api(`/downloads/${task.id}/rerun`, { method: "POST" });
      if (action === "cbz") {
        const result = await api<{ path: string }>(`/downloads/${task.id}/cbz`, { method: "POST" });
        window.alert(`CBZ: ${result.path}`);
      }
      if (action === "delete") await api(`/downloads/${task.id}`, { method: "DELETE" });
      if (action === "delete-files") await api(`/downloads/${task.id}?files=true`, { method: "DELETE" });
      await loadDownloads();
    });
  }

  function saveAccessToken(value: string) {
    setAccessToken(value);
    if (value) window.localStorage.setItem("venera_access_token", value);
    else window.localStorage.removeItem("venera_access_token");
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Venera Web</p>
          <h1>插件漫画源的 Web 阅读台</h1>
          <p>搜索、详情、阅读和下载主流程已接入 `/api/v1`，当前优先保留 PoC 能力并提供正式前端骨架。</p>
        </div>
        <button onClick={() => void refresh()} disabled={busy}>刷新源</button>
      </header>

      {error && <section className="alert">{error}</section>}

      <section className="panel controls">
        <label>源<select value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>{sources.map((source) => <option key={source.key} value={source.key}>{source.name} ({source.key})</option>)}</select></label>
        <label>关键词<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" /></label>
        <label>访问 Token<input value={accessToken} onChange={(event) => saveAccessToken(event.target.value)} placeholder="可选" type="password" /></label>
        <button onClick={() => void search()} disabled={busy || !sourceKey}>搜索</button>
      </section>

      <section className="panel source-tools">
        <h2>源管理</h2>
        <div className="tool-row">
          <label>可安装源<select value={installSource} onChange={(event) => setInstallSource(event.target.value)}><option value="">选择源</option>{availableSources.map((source) => <option key={source.key ?? source.fileName ?? source.name} value={source.key ?? source.fileName ?? source.name}>{source.name} ({source.key ?? source.fileName ?? source.filename})</option>)}</select></label>
          <button onClick={() => void installSelectedSource()} disabled={busy || !installSource}>安装/更新</button>
          <button onClick={() => void refreshRepository()} disabled={busy}>刷新仓库</button>
          <button onClick={() => void reloadSources()} disabled={busy}>重载已安装源</button>
          <button onClick={() => void loadSourceSettings()} disabled={busy || !sourceKey}>加载设置</button>
        </div>
        {sourceMetadata.length > 0 && <div className="source-list">{sourceMetadata.map((source) => <article key={source.key}><div><strong>{source.name}</strong><span className="muted">{source.key}{source.version ? ` / ${source.version}` : ""}</span></div><button onClick={() => void setSourceEnabled(source, !(source.enabled === true || source.enabled === 1))} disabled={busy}>{source.enabled === true || source.enabled === 1 ? "禁用" : "启用"}</button></article>)}</div>}
        {sourceSettings && <div className="settings-grid"><label>源设置 JSON<textarea value={settingsJson} onChange={(event) => setSettingsJson(event.target.value)} /></label><div><p className="muted">配置项：{Object.keys(sourceSettings.schema ?? {}).join(", ") || "无"}</p><button onClick={() => void saveSourceSettings()} disabled={busy}>保存设置</button></div></div>}
        <div className="settings-grid"><label>Cookie URL<input value={cookieUrl} onChange={(event) => setCookieUrl(event.target.value)} placeholder="https://example.com" /></label><label>Cookie 每行一条<textarea value={cookieText} onChange={(event) => setCookieText(event.target.value)} placeholder="name=value; Domain=..." /></label><button onClick={() => void importCookies()} disabled={busy || !cookieUrl || !cookieText}>导入 Cookie</button></div>
      </section>

      <section className="panel history">
        <h2>阅读历史</h2>
        {history.length === 0 ? <p className="muted">暂无历史记录。</p> : history.map((item) => <article key={`${item.sourceKey ?? item.source_key}:${item.comicId ?? item.comic_id}`}><strong>{item.comicId ?? item.comic_id}</strong><span className="muted">{item.sourceKey ?? item.source_key} / {item.episodeId ?? item.episode_id ?? "未记录章节"} / 第 {(item.page ?? 0) + 1} 页</span></article>)}
      </section>

      <section className="grid">
        <div className="panel">
          <h2>搜索结果</h2>
          <div className="cards">
            {results.map((comic) => <button className="comic-card" key={comic.id} onClick={() => void openComic(comic)}><img src={imageUrl(sourceKey, comic.cover ?? "mock://cover/0", comic.id, undefined, true)} alt="" /><strong>{comic.title}</strong><span>{comic.description}</span></button>)}
          </div>
        </div>

        <aside className="panel details">
          <h2>详情</h2>
          {details ? <>
            <h3>{details.title}</h3>
            <p>{details.description}</p>
            <div className="chips">{Object.entries(details.chapters ?? {}).map(([id, title]) => <button className={id === episodeId ? "active" : ""} key={id} onClick={() => void readEpisode(id)}>{title}</button>)}</div>
            <div className="actions"><button onClick={() => void readEpisode()}>开始阅读</button><button onClick={() => void createDownload(false)}>下载章节</button><button onClick={() => void createDownload(true)}>下载全本</button></div>
          </> : <p className="muted">选择一本漫画查看章节。</p>}
        </aside>
      </section>

      <section className="panel reader">
        <h2>阅读器</h2>
        {images.length === 0 ? <p className="muted">打开章节后显示图片，移动端为单列长条模式。</p> : images.map((image, index) => <img key={`${image}-${index}`} src={imageUrl(sourceKey, image, details?.comicId ?? details?.id, episodeId ?? undefined)} alt={`page ${index + 1}`} loading={index < 2 ? "eager" : "lazy"} />)}
      </section>

      <section className="panel downloads">
        <h2>下载任务</h2>
        {cache && <p className="muted">图片缓存：{cache.files} 个文件，{(cache.bytes / 1024 / 1024).toFixed(2)} MB <button onClick={() => void pruneCache()}>按限制裁剪</button> <button onClick={() => void clearCache()}>清理缓存</button></p>}
        {downloads.map((task) => <article key={task.id}><strong>{task.title ?? task.comicId}</strong><span>{task.status} / {task.phase}</span><progress value={task.completed} max={Math.max(task.total, 1)} />{task.error && <small>{task.error}</small>}<div className="actions"><button onClick={() => void loadDownloadItems(task)}>明细</button><button onClick={() => void downloadAction(task, "cancel")}>取消</button><button onClick={() => void downloadAction(task, "rerun")}>重跑</button><button onClick={() => void downloadAction(task, "cbz")}>导出 CBZ</button><button onClick={() => void downloadAction(task, "delete")}>删除</button><button onClick={() => void downloadAction(task, "delete-files")}>删除+文件</button></div>{task.logs?.length ? <small className="muted">{task.logs.at(-1)?.message}</small> : null}{downloadItems[task.id]?.length ? <div className="download-items">{downloadItems[task.id].map((item) => <div key={item.imageKey ?? item.image_key}><span>{item.imageKey ?? item.image_key}</span><span>{item.status}{item.error ? ` / ${item.error}` : ""}</span><button onClick={() => void retryDownloadItem(task, item)} disabled={busy}>重试</button></div>)}</div> : null}</article>)}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
