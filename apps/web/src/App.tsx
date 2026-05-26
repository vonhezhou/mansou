import { useEffect, useState, startTransition } from "react";
import type { Comic } from "@venera/contracts";
import { downloadsEventUrl, imageUrl, veneraApi } from "./api/venera.js";
import { getAccessToken, saveAccessTokenValue } from "./api/client.js";
import type { CacheStats, Details, DownloadItem, DownloadTask, HistoryItem, RepositorySource, SettingsResponse, Source, SourceMetadata } from "./types.js";

const tabs = [
  { key: "search", label: "搜索" },
  { key: "history", label: "历史" },
  { key: "downloads", label: "下载" },
  { key: "sources", label: "源管理" },
] as const;

type TabKey = typeof tabs[number]["key"];

function readInitialTab(): TabKey {
  const hash = window.location.hash.slice(1);
  return tabs.some((tab) => tab.key === hash) ? hash as TabKey : "search";
}

export function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [availableSources, setAvailableSources] = useState<RepositorySource[]>([]);
  const [sourceKey, setSourceKey] = useState("mock");
  const [installSource, setInstallSource] = useState("");
  const [keyword, setKeyword] = useState("test");
  const [results, setResults] = useState<Comic[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchNext, setSearchNext] = useState<string | null>(null);
  const [searchMaxPage, setSearchMaxPage] = useState<number | undefined>();
  const [hasSearched, setHasSearched] = useState(false);
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
  const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    const events = new EventSource(downloadsEventUrl());
    events.addEventListener("downloads", (event) => setDownloads(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, [accessToken]);

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

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
      const loaded = await veneraApi.listInstalledSources();
      const metadata = await veneraApi.listSourceMetadata();
      const repository = await veneraApi.listAvailableSources();
      setSources(loaded);
      setSourceMetadata(metadata);
      setAvailableSources(repository);
      if (loaded[0] && !loaded.some((source) => source.key === sourceKey)) setSourceKey(loaded[0].key);
      await loadDownloads();
      setCache(await veneraApi.getCacheStats());
      setHistory(await veneraApi.listHistory());
    });
  }

  async function search() {
    await run(async () => {
      const data = await veneraApi.search(sourceKey, keyword, { page: 1 });
      startTransition(() => {
        setResults(data.comics ?? []);
        setSearchPage(1);
        setSearchNext(data.next ?? null);
        setSearchMaxPage(data.maxPage);
        setHasSearched(true);
        setDetails(null);
        setImages([]);
      });
    });
  }

  async function loadMoreResults() {
    await run(async () => {
      const nextPage = searchPage + 1;
      const data = await veneraApi.search(sourceKey, keyword, searchNext ? { next: searchNext } : { page: nextPage });
      startTransition(() => {
        setResults((current) => [...current, ...(data.comics ?? [])]);
        setSearchPage(nextPage);
        setSearchNext(data.next ?? null);
        setSearchMaxPage(data.maxPage);
      });
    });
  }

  async function openComic(comic: Comic) {
    await run(async () => {
      const data = await veneraApi.comicDetails(sourceKey, comic.id);
      const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
      setDetails(data);
      setEpisodeId(firstEpisode);
      setImages([]);
    });
  }

  async function loadSourceSettings(nextSourceKey = sourceKey) {
    await run(async () => {
      const data = await veneraApi.getSourceSettings(nextSourceKey);
      setSourceSettings(data);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function saveSourceSettings() {
    await run(async () => {
      await veneraApi.updateSourceSettings(sourceKey, JSON.parse(settingsJson));
      await loadSourceSettings(sourceKey);
    });
  }

  async function importCookies() {
    await run(async () => {
      const cookies = cookieText.split("\n").map((line) => line.trim()).filter(Boolean);
      await veneraApi.importCookies(sourceKey, cookieUrl, cookies);
      setCookieText("");
    });
  }

  async function installSelectedSource() {
    if (!installSource) return;
    await run(async () => {
      await veneraApi.installSource(installSource);
      await refresh();
    });
  }

  async function refreshRepository() {
    await run(async () => {
      const data = await veneraApi.refreshRepository();
      setAvailableSources(data.sources ?? []);
    });
  }

  async function reloadSources() {
    await run(async () => {
      await veneraApi.reloadSources();
      await refresh();
    });
  }

  async function setSourceEnabled(metadata: SourceMetadata, enabled: boolean) {
    await run(async () => {
      await veneraApi.setSourceEnabled(metadata.key, enabled);
      await refresh();
    });
  }

  async function readEpisode(nextEpisodeId = episodeId) {
    if (!details || !nextEpisodeId) return;
    await run(async () => {
      const data = await veneraApi.episodePages(sourceKey, details.comicId ?? details.id, nextEpisodeId);
      setEpisodeId(nextEpisodeId);
      setImages(data.images ?? []);
      await veneraApi.saveHistory(sourceKey, details.comicId ?? details.id, nextEpisodeId);
      setHistory(await veneraApi.listHistory());
    });
  }

  async function createDownload(all = false) {
    if (!details) return;
    await run(async () => {
      await veneraApi.createDownload({ sourceKey, comicId: details.comicId ?? details.id, episodeId: episodeId ?? undefined, all });
      await loadDownloads();
    });
  }

  async function loadDownloads() {
    setDownloads(await veneraApi.listDownloads());
  }

  async function clearCache() {
    await run(async () => setCache(await veneraApi.clearCache()));
  }

  async function pruneCache() {
    await run(async () => setCache(await veneraApi.pruneCache()));
  }

  async function loadDownloadItems(task: DownloadTask) {
    await run(async () => {
      const items = await veneraApi.listDownloadItems(task.id);
      setDownloadItems((current) => ({ ...current, [task.id]: items }));
    });
  }

  async function retryDownloadItem(task: DownloadTask, item: DownloadItem) {
    const imageKey = item.imageKey ?? item.image_key;
    if (!imageKey) return;
    await run(async () => {
      await veneraApi.retryDownloadItem(task.id, imageKey);
      await loadDownloadItems(task);
      await loadDownloads();
    });
  }

  async function downloadAction(task: DownloadTask, action: "cancel" | "rerun" | "cbz" | "delete" | "delete-files") {
    await run(async () => {
      if (action === "cancel") await veneraApi.cancelDownload(task.id);
      if (action === "rerun") await veneraApi.rerunDownload(task.id);
      if (action === "cbz") {
        const result = await veneraApi.exportDownloadCbz(task.id);
        window.alert(`CBZ: ${result.path}`);
      }
      if (action === "delete") await veneraApi.deleteDownload(task.id);
      if (action === "delete-files") await veneraApi.deleteDownload(task.id, true);
      await loadDownloads();
    });
  }

  function saveAccessToken(value: string) {
    setAccessToken(value);
    saveAccessTokenValue(value);
  }

  const canLoadMore = Boolean(searchNext) || (searchMaxPage !== undefined && searchPage < searchMaxPage);

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Venera Web</p>
          <h1>插件漫画源的 Web 阅读台</h1>
          <p>搜索、阅读、下载和源管理已接入 `/api/v1`，正在从 PoC 控制台推进为正式前端。</p>
        </div>
        <div className="hero-actions">
          <label>访问 Token<input value={accessToken} onChange={(event) => saveAccessToken(event.target.value)} placeholder="可选" type="password" /></label>
          <button onClick={() => void refresh()} disabled={busy}>刷新</button>
        </div>
      </header>

      {error && <section className="alert">{error}</section>}

      <nav className="tabs" aria-label="主要功能">
        {tabs.map((tab) => <button className={tab.key === activeTab ? "active" : ""} key={tab.key} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
      </nav>

      {activeTab === "search" && <>
        <section className="panel controls">
          <label>源<select value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>{sources.map((source) => <option key={source.key} value={source.key}>{source.name} ({source.key})</option>)}</select></label>
          <label>关键词<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" /></label>
          <button onClick={() => void search()} disabled={busy || !sourceKey}>搜索</button>
        </section>

        <section className="grid">
          <div className="panel">
            <h2>搜索结果</h2>
            {!hasSearched && <p className="muted">输入关键词后开始搜索。</p>}
            {hasSearched && results.length === 0 && <p className="muted">没有找到结果，可以更换关键词或源。</p>}
            <div className="cards">
              {results.map((comic) => <button className="comic-card" key={comic.id} onClick={() => void openComic(comic)}><img src={imageUrl(sourceKey, comic.cover ?? "mock://cover/0", comic.id, undefined, true)} alt="" /><strong>{comic.title}</strong><span>{comic.description}</span></button>)}
            </div>
            {results.length > 0 && <div className="load-more"><span className="muted">已加载 {results.length} 项{searchMaxPage ? ` / 第 ${searchPage} 页，共 ${searchMaxPage} 页` : ""}</span><button onClick={() => void loadMoreResults()} disabled={busy || !canLoadMore}>{canLoadMore ? "加载更多" : "没有更多"}</button></div>}
          </div>

          <aside className="panel details">
            <h2>详情</h2>
            {details ? <>
              {details.cover && <img className="detail-cover" src={imageUrl(sourceKey, details.cover, details.comicId ?? details.id, undefined, true)} alt="" />}
              <h3>{details.title}</h3>
              <p>{details.description}</p>
              <p className="muted">漫画 ID：{details.comicId ?? details.id}</p>
              <div className="chips">{Object.entries(details.chapters ?? {}).map(([id, title]) => <button className={id === episodeId ? "active" : ""} key={id} onClick={() => void readEpisode(id)}>{title}</button>)}</div>
              <div className="actions"><button onClick={() => void readEpisode()}>开始阅读</button><button onClick={() => void createDownload(false)}>下载章节</button><button onClick={() => void createDownload(true)}>下载全本</button></div>
            </> : <p className="muted">选择一本漫画查看章节。</p>}
          </aside>
        </section>

        <section className="panel reader">
          <h2>阅读器</h2>
          {images.length === 0 ? <p className="muted">打开章节后显示图片，移动端为单列长条模式。</p> : images.map((image, index) => <img key={`${image}-${index}`} src={imageUrl(sourceKey, image, details?.comicId ?? details?.id, episodeId ?? undefined)} alt={`page ${index + 1}`} loading={index < 2 ? "eager" : "lazy"} />)}
        </section>
      </>}

      {activeTab === "sources" && <section className="panel source-tools">
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
      </section>}

      {activeTab === "history" && <section className="panel history">
        <h2>阅读历史</h2>
        {history.length === 0 ? <p className="muted">暂无历史记录。</p> : history.map((item) => <article key={`${item.sourceKey ?? item.source_key}:${item.comicId ?? item.comic_id}`}><strong>{item.comicId ?? item.comic_id}</strong><span className="muted">{item.sourceKey ?? item.source_key} / {item.episodeId ?? item.episode_id ?? "未记录章节"} / 第 {(item.page ?? 0) + 1} 页</span></article>)}
      </section>}

      {activeTab === "downloads" && <section className="panel downloads">
        <h2>下载任务</h2>
        {cache && <p className="muted">图片缓存：{cache.files} 个文件，{(cache.bytes / 1024 / 1024).toFixed(2)} MB <button onClick={() => void pruneCache()}>按限制裁剪</button> <button onClick={() => void clearCache()}>清理缓存</button></p>}
        {downloads.map((task) => <article key={task.id}><strong>{task.title ?? task.comicId}</strong><span>{task.status} / {task.phase}</span><progress value={task.completed} max={Math.max(task.total, 1)} />{task.error && <small>{task.error}</small>}<div className="actions"><button onClick={() => void loadDownloadItems(task)}>明细</button><button onClick={() => void downloadAction(task, "cancel")}>取消</button><button onClick={() => void downloadAction(task, "rerun")}>重跑</button><button onClick={() => void downloadAction(task, "cbz")}>导出 CBZ</button><button onClick={() => void downloadAction(task, "delete")}>删除</button><button onClick={() => void downloadAction(task, "delete-files")}>删除+文件</button></div>{task.logs?.length ? <small className="muted">{task.logs.at(-1)?.message}</small> : null}{downloadItems[task.id]?.length ? <div className="download-items">{downloadItems[task.id].map((item) => { const imageKey = item.imageKey ?? item.image_key ?? ""; return <div key={imageKey}><span>{imageKey}</span><span>{item.status}{item.error ? ` / ${item.error}` : ""}</span><button onClick={() => void retryDownloadItem(task, item)} disabled={busy}>重试</button></div>; })}</div> : null}</article>)}
      </section>}
    </main>
  );
}
