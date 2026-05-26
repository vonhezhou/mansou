import { useEffect, useState, startTransition } from "react";
import type { Comic } from "@venera/contracts";
import { downloadsEventUrl, veneraApi } from "./api/venera.js";
import { getAccessToken, saveAccessTokenValue } from "./api/client.js";
import { getHistoryComicId, getHistoryEpisodeId, getHistorySourceKey } from "./lib/history.js";
import type { AggregatedSearchItem, CacheStats, Details, DownloadItem, DownloadTask, Health, HistoryItem, RepositorySource, SettingsResponse, Source, SourceMetadata } from "./types.js";
import { DownloadsView } from "./views/DownloadsView.js";
import { HistoryView } from "./views/HistoryView.js";
import { SearchView } from "./views/SearchView.js";
import { SourcesView } from "./views/SourcesView.js";

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
  const [searchMode, setSearchMode] = useState<"single" | "aggregate">("single");
  const [results, setResults] = useState<Comic[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedSearchItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchNext, setSearchNext] = useState<string | null>(null);
  const [searchMaxPage, setSearchMaxPage] = useState<number | undefined>();
  const [hasSearched, setHasSearched] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [downloadItems, setDownloadItems] = useState<Record<string, DownloadItem[]>>({});
  const [failedItemsOnly, setFailedItemsOnly] = useState(false);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [sourceMetadata, setSourceMetadata] = useState<SourceMetadata[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sourceSettings, setSourceSettings] = useState<SettingsResponse | null>(null);
  const [settingsJson, setSettingsJson] = useState("{}");
  const [cookieUrl, setCookieUrl] = useState("");
  const [cookieText, setCookieText] = useState("");
  const [accessToken, setAccessToken] = useState(getAccessToken());
  const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    const events = new EventSource(downloadsEventUrl());
    events.addEventListener("downloads", (event) => setDownloads(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, [accessToken]);

  useEffect(() => {
    void checkHealth();
  }, []);

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

  async function checkHealth() {
    try {
      setHealth(await veneraApi.health());
    } catch {
      setHealth(null);
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
        setAggregatedResults([]);
        setSearchPage(1);
        setSearchNext(data.next ?? null);
        setSearchMaxPage(data.maxPage);
        setHasSearched(true);
        setDetails(null);
        setImages([]);
      });
    });
  }

  async function aggregatedSearch() {
    await run(async () => {
      const data = await veneraApi.aggregatedSearch(keyword);
      startTransition(() => {
        setAggregatedResults(data);
        setResults([]);
        setSearchPage(1);
        setSearchNext(null);
        setSearchMaxPage(undefined);
        setHasSearched(true);
        setDetails(null);
        setImages([]);
      });
    });
  }

  async function submitSearch() {
    if (searchMode === "aggregate") await aggregatedSearch();
    else await search();
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

  async function openComic(comic: Comic, nextSourceKey = sourceKey) {
    await run(async () => {
      const data = await veneraApi.comicDetails(nextSourceKey, comic.id);
      const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
      setSourceKey(nextSourceKey);
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

  async function resetSourceSettings() {
    await run(async () => {
      const data = await veneraApi.clearSourceSettings(sourceKey);
      setSourceSettings(data);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function importCookies() {
    await run(async () => {
      const cookies = cookieText.split("\n").map((line) => line.trim()).filter(Boolean);
      await veneraApi.importCookies(sourceKey, cookieUrl, cookies);
      setCookieText("");
    });
  }

  async function clearCookies() {
    if (!window.confirm(`清空源「${sourceKey}」的 Cookie？`)) return;
    await run(async () => {
      await veneraApi.clearCookies(sourceKey);
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

  async function readEpisode(nextEpisodeId = episodeId, initialPage = 0) {
    if (!details || !nextEpisodeId) return;
    await run(async () => {
      const data = await veneraApi.episodePages(sourceKey, details.comicId ?? details.id, nextEpisodeId);
      setEpisodeId(nextEpisodeId);
      setImages(data.images ?? []);
      await veneraApi.saveHistory(sourceKey, details.comicId ?? details.id, { episodeId: nextEpisodeId, page: initialPage, progress: data.images.length > 0 ? initialPage / data.images.length : 0 });
      setHistory(await veneraApi.listHistory());
      if (initialPage > 0) window.setTimeout(() => document.getElementById(`page-${initialPage + 1}`)?.scrollIntoView({ block: "start" }), 100);
    });
  }

  async function openHistoryItem(item: HistoryItem) {
    const nextSourceKey = getHistorySourceKey(item);
    const comicId = getHistoryComicId(item);
    const nextEpisodeId = getHistoryEpisodeId(item);
    if (!nextSourceKey || !comicId) return;
    await run(async () => {
      const data = await veneraApi.comicDetails(nextSourceKey, comicId);
      const episodeToRead = nextEpisodeId ?? Object.keys(data.chapters ?? {})[0] ?? "_default";
      const pages = await veneraApi.episodePages(nextSourceKey, data.comicId ?? data.id, episodeToRead);
      setSourceKey(nextSourceKey);
      setDetails(data);
      setEpisodeId(episodeToRead);
      setImages(pages.images ?? []);
      setActiveTab("search");
      window.setTimeout(() => document.getElementById(`page-${(item.page ?? 0) + 1}`)?.scrollIntoView({ block: "start" }), 100);
    });
  }

  async function createDownload(all = false) {
    if (!details) return;
    await run(async () => {
      await veneraApi.createDownload({ sourceKey, comicId: details.comicId ?? details.id, episodeId: episodeId ?? undefined, all });
      await loadDownloads();
    });
  }

  async function downloadComic(comic: Comic, nextSourceKey = sourceKey) {
    await run(async () => {
      await veneraApi.createDownload({ sourceKey: nextSourceKey, comicId: comic.id, all: true });
      setActiveTab("downloads");
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
      if (action === "delete") {
        if (!window.confirm(`删除下载任务「${task.title ?? task.comicId}」？`)) return;
        await veneraApi.deleteDownload(task.id);
      }
      if (action === "delete-files") {
        if (!window.confirm(`删除下载任务「${task.title ?? task.comicId}」及已下载文件？`)) return;
        await veneraApi.deleteDownload(task.id, true);
      }
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
          <span className={health?.ok ? "health online" : "health offline"}>{health?.ok ? "服务在线" : "服务未连接"}</span>
          <label>访问 Token<input value={accessToken} onChange={(event) => saveAccessToken(event.target.value)} placeholder="可选" type="password" /></label>
          <button onClick={() => { void checkHealth(); void refresh(); }} disabled={busy}>刷新</button>
        </div>
      </header>

      {error && <section className="alert">{error}</section>}

      <nav className="tabs" aria-label="主要功能">
        {tabs.map((tab) => <button className={tab.key === activeTab ? "active" : ""} key={tab.key} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
      </nav>

      {activeTab === "search" && <SearchView busy={busy} sourceKey={sourceKey} sources={sources} keyword={keyword} searchMode={searchMode} results={results} aggregatedResults={aggregatedResults} details={details} episodeId={episodeId} images={images} hasSearched={hasSearched} searchPage={searchPage} searchMaxPage={searchMaxPage} canLoadMore={canLoadMore} onSourceChange={setSourceKey} onKeywordChange={setKeyword} onSearchModeChange={setSearchMode} onSearch={() => void submitSearch()} onLoadMore={() => void loadMoreResults()} onOpenComic={(comic, nextSourceKey) => void openComic(comic, nextSourceKey)} onDownloadComic={(comic, nextSourceKey) => void downloadComic(comic, nextSourceKey)} onReadEpisode={(id) => void readEpisode(id)} onCreateDownload={(all) => void createDownload(all)} />}

      {activeTab === "sources" && <SourcesView busy={busy} sourceKey={sourceKey} installSource={installSource} availableSources={availableSources} sourceMetadata={sourceMetadata} sourceSettings={sourceSettings} settingsJson={settingsJson} cookieUrl={cookieUrl} cookieText={cookieText} onInstallSourceChange={setInstallSource} onSettingsJsonChange={setSettingsJson} onCookieUrlChange={setCookieUrl} onCookieTextChange={setCookieText} onInstallSelectedSource={() => void installSelectedSource()} onRefreshRepository={() => void refreshRepository()} onReloadSources={() => void reloadSources()} onLoadSourceSettings={() => void loadSourceSettings()} onSetSourceEnabled={(source, enabled) => void setSourceEnabled(source, enabled)} onSaveSourceSettings={() => void saveSourceSettings()} onResetSourceSettings={() => void resetSourceSettings()} onImportCookies={() => void importCookies()} onClearCookies={() => void clearCookies()} />}

      {activeTab === "history" && <HistoryView history={history} onOpenHistoryItem={(item) => void openHistoryItem(item)} />}

      {activeTab === "downloads" && <DownloadsView busy={busy} cache={cache} downloads={downloads} downloadItems={downloadItems} failedItemsOnly={failedItemsOnly} onFailedItemsOnlyChange={setFailedItemsOnly} onPruneCache={() => void pruneCache()} onClearCache={() => void clearCache()} onLoadDownloadItems={(task) => void loadDownloadItems(task)} onDownloadAction={(task, action) => void downloadAction(task, action)} onRetryDownloadItem={(task, item) => void retryDownloadItem(task, item)} />}
    </main>
  );
}
