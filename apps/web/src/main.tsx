import { useEffect, useState, startTransition } from "react";
import { createRoot } from "react-dom/client";
import type { Comic } from "@venera/contracts";
import "./styles.css";

type Source = { key: string; name: string; version?: string; hasSearch?: boolean; hasComic?: boolean };
type SearchResult = { comics: Comic[]; maxPage?: number; next?: string | null };
type Details = Comic & { comicId?: string; chapters?: Record<string, string>; thumbnails?: string[] };
type DownloadTask = { id: string; title?: string; sourceKey: string; comicId: string; status: string; phase: string; total: number; completed: number; error?: string };
type CacheStats = { files: number; bytes: number };

const apiBase = "/api/v1";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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
  return `${apiBase}/image?${params}`;
}

function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceKey, setSourceKey] = useState("mock");
  const [keyword, setKeyword] = useState("test");
  const [results, setResults] = useState<Comic[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    const events = new EventSource(`${apiBase}/downloads/events`);
    events.addEventListener("downloads", (event) => setDownloads(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, []);

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
      const loaded = await api<Source[]>("/sources");
      setSources(loaded);
      if (loaded[0] && !loaded.some((source) => source.key === sourceKey)) setSourceKey(loaded[0].key);
      await loadDownloads();
      setCache(await api<CacheStats>("/settings/cache"));
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
      const data = await api<Details>(`/comics/${sourceKey}/${encodeURIComponent(comic.id)}`);
      const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
      setDetails(data);
      setEpisodeId(firstEpisode);
      setImages([]);
    });
  }

  async function readEpisode(nextEpisodeId = episodeId) {
    if (!details || !nextEpisodeId) return;
    await run(async () => {
      const data = await api<{ images: string[] }>(`/comics/${sourceKey}/${encodeURIComponent(details.comicId ?? details.id)}/episodes/${encodeURIComponent(nextEpisodeId)}/pages`);
      setEpisodeId(nextEpisodeId);
      setImages(data.images ?? []);
      await api(`/library/history/${sourceKey}/${encodeURIComponent(details.comicId ?? details.id)}`, {
        method: "PUT",
        body: JSON.stringify({ episodeId: nextEpisodeId, page: 0, progress: 0 }),
      });
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
        <button onClick={() => void search()} disabled={busy || !sourceKey}>搜索</button>
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
        {cache && <p className="muted">图片缓存：{cache.files} 个文件，{(cache.bytes / 1024 / 1024).toFixed(2)} MB <button onClick={() => void clearCache()}>清理缓存</button></p>}
        {downloads.map((task) => <article key={task.id}><strong>{task.title ?? task.comicId}</strong><span>{task.status} / {task.phase}</span><progress value={task.completed} max={Math.max(task.total, 1)} />{task.error && <small>{task.error}</small>}</article>)}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
