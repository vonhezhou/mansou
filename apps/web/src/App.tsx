import { useEffect, useState, startTransition } from "react";
import type { Comic } from "@venera/contracts";
import { downloadsEventUrl, veneraApi } from "./api/venera.js";
import { getAccessToken, saveAccessTokenValue } from "./api/client.js";
import { AppShell } from "./app/AppShell.js";
import { isTabKey, type TabKey } from "./app/navigation.js";
import { getHistoryComicId, getHistoryEpisodeId, getHistorySourceKey } from "./lib/history.js";
import type { AggregatedSearchItem, Details, Health, HistoryItem } from "./types.js";
import { DownloadsView } from "./features/downloads/DownloadsView.js";
import { HistoryView } from "./features/history/HistoryView.js";
import { SearchView } from "./features/search/SearchView.js";
import { SourcesView } from "./features/sources/SourcesView.js";
import { useDownloads } from "./hooks/useDownloads.js";
import { useSources } from "./hooks/useSources.js";

function readInitialTab(): TabKey {
  const hash = window.location.hash.slice(1);
  return isTabKey(hash) ? hash : "search";
}

export function App() {
  const [sourceKey, setSourceKey] = useState("mock");
  const [keyword, setKeyword] = useState("test");
  const [searchMode, setSearchMode] = useState<"single" | "aggregate">("single");
  const [aggregateSourceKeys, setAggregateSourceKeys] = useState<string[]>([]);
  const [aggregateResultLayout, setAggregateResultLayout] = useState<"grouped" | "flat">("grouped");
  const [results, setResults] = useState<Comic[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedSearchItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchNext, setSearchNext] = useState<string | null>(null);
  const [searchMaxPage, setSearchMaxPage] = useState<number | undefined>();
  const [hasSearched, setHasSearched] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [detailSourceKey, setDetailSourceKey] = useState(sourceKey);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [accessToken, setAccessToken] = useState(getAccessToken());
  const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);
  const [health, setHealth] = useState<Health | null>(null);
  const [downloadCreateStatus, setDownloadCreateStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [previewingChapter, setPreviewingChapter] = useState(false);
  const [creatingDownload, setCreatingDownload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadsState = useDownloads(runWith);
  const sourcesState = useSources(runWith, sourceKey, setSourceKey);

  useEffect(() => {
    void refresh();
    const events = new EventSource(downloadsEventUrl());
    events.addEventListener("downloads", (event) => downloadsState.setDownloads(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, [accessToken]);

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  async function runWith(setLoading: (value: boolean) => void, task: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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
    await runWith(setRefreshing, async () => {
      const loaded = await sourcesState.loadSources();
      setAggregateSourceKeys((current) => current.length ? current.filter((key) => loaded.some((source) => source.key === key)) : loaded.filter((source) => source.hasSearch).slice(0, 1).map((source) => source.key));
      await downloadsState.loadDownloads();
      await downloadsState.loadCacheStats();
      setHistory(await veneraApi.listHistory());
    });
  }

  async function search() {
    await runWith(setSearching, async () => {
      const data = await veneraApi.search(sourceKey, keyword, { page: 1 });
      startTransition(() => {
        setResults(data.comics ?? []);
        setAggregatedResults([]);
        setSearchPage(1);
        setSearchNext(data.next ?? null);
        setSearchMaxPage(data.maxPage);
        setHasSearched(true);
        setDetails(null);
        setPreviewImages([]);
      });
    });
  }

  async function aggregatedSearch() {
    await runWith(setSearching, async () => {
      const data = await veneraApi.aggregatedSearch(keyword, aggregateSourceKeys);
      startTransition(() => {
        setAggregatedResults(data);
        setResults([]);
        setSearchPage(1);
        setSearchNext(null);
        setSearchMaxPage(undefined);
        setHasSearched(true);
        setDetails(null);
        setPreviewImages([]);
      });
    });
  }

  async function submitSearch() {
    if (searchMode === "aggregate") await aggregatedSearch();
    else await search();
  }

  async function loadMoreResults() {
    await runWith(setSearching, async () => {
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
    await runWith(setLoadingDetails, async () => {
      const data = await veneraApi.comicDetails(nextSourceKey, comic.id);
      const firstEpisode = Object.keys(data.chapters ?? {})[0] ?? "_default";
      setSourceKey(nextSourceKey);
      setDetailSourceKey(nextSourceKey);
      setDetails(data);
      setEpisodeId(firstEpisode);
      setSelectedEpisodeIds([]);
      setPreviewImages([]);
    });
  }

  async function previewEpisode(nextEpisodeId = episodeId, initialPage = 0) {
    if (!details || !nextEpisodeId) return;
    await runWith(setPreviewingChapter, async () => {
      const data = await veneraApi.episodePages(detailSourceKey, details.comicId ?? details.id, nextEpisodeId);
      setEpisodeId(nextEpisodeId);
      setPreviewImages(data.images ?? []);
      await veneraApi.saveHistory(detailSourceKey, details.comicId ?? details.id, { episodeId: nextEpisodeId, page: initialPage, progress: data.images.length > 0 ? initialPage / data.images.length : 0 });
      setHistory(await veneraApi.listHistory());
      if (initialPage > 0) window.setTimeout(() => document.getElementById(`page-${initialPage + 1}`)?.scrollIntoView({ block: "start" }), 100);
    });
  }

  async function openHistoryItem(item: HistoryItem, mode: "details" | "read") {
    const nextSourceKey = getHistorySourceKey(item);
    const comicId = getHistoryComicId(item);
    const nextEpisodeId = getHistoryEpisodeId(item);
    if (!nextSourceKey || !comicId) return;
    await runWith(mode === "details" ? setLoadingDetails : setPreviewingChapter, async () => {
      const data = await veneraApi.comicDetails(nextSourceKey, comicId);
      const episodeToRead = nextEpisodeId ?? Object.keys(data.chapters ?? {})[0] ?? "_default";
      setSourceKey(nextSourceKey);
      setDetailSourceKey(nextSourceKey);
      setDetails(data);
      setEpisodeId(episodeToRead);
      setSelectedEpisodeIds([]);
      setActiveTab("search");
      if (mode === "details") {
        setPreviewImages([]);
      } else {
        const pages = await veneraApi.episodePages(nextSourceKey, data.comicId ?? data.id, episodeToRead);
        setPreviewImages(pages.images ?? []);
        window.setTimeout(() => document.getElementById(`page-${(item.page ?? 0) + 1}`)?.scrollIntoView({ block: "start" }), 100);
      }
    });
  }

  async function createDownload(mode: "first" | "selected" | "all") {
    if (!details) return;
    await runWith(setCreatingDownload, async () => {
      const comicId = details.comicId ?? details.id;
      const firstEpisode = Object.keys(details.chapters ?? {})[0] ?? "_default";
      const episodeIds = mode === "selected" ? selectedEpisodeIds : [firstEpisode];
      const requests = mode === "all"
        ? [{ sourceKey: detailSourceKey, comicId, all: true }]
        : episodeIds.map((id) => ({ sourceKey: detailSourceKey, comicId, episodeId: id }));
      let success = 0;
      let failed = 0;
      setDownloadCreateStatus(`创建中：0/${requests.length}`);
      for (const request of requests) {
        try {
          await veneraApi.createDownload(request);
          success += 1;
        } catch {
          failed += 1;
        }
        setDownloadCreateStatus(`创建中：${success + failed}/${requests.length}，成功 ${success}，失败 ${failed}`);
      }
      setDownloadCreateStatus(`创建完成：成功 ${success}，失败 ${failed}`);
      setActiveTab("downloads");
      await downloadsState.loadDownloads();
    });
  }

  function toggleAggregateSource(source: string) {
    setAggregateSourceKeys((current) => current.includes(source) ? current.filter((key) => key !== source) : [...current, source]);
  }

  function toggleSelectedEpisode(id: string) {
    setSelectedEpisodeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectEpisodes(action: "all" | "clear" | "invert") {
    const ids = Object.keys(details?.chapters ?? {});
    if (action === "all") setSelectedEpisodeIds(ids);
    if (action === "clear") setSelectedEpisodeIds([]);
    if (action === "invert") setSelectedEpisodeIds((current) => ids.filter((id) => !current.includes(id)));
  }

  async function downloadComic(comic: Comic, nextSourceKey = sourceKey) {
    await runWith(setCreatingDownload, async () => {
      await veneraApi.createDownload({ sourceKey: nextSourceKey, comicId: comic.id, all: true });
      setActiveTab("downloads");
      await downloadsState.loadDownloads();
    });
  }

  function saveAccessToken(value: string) {
    setAccessToken(value);
    saveAccessTokenValue(value);
  }

  const canLoadMore = Boolean(searchNext) || (searchMaxPage !== undefined && searchPage < searchMaxPage);
  const shellBusy = refreshing;
  const searchBusy = searching || loadingDetails || previewingChapter || creatingDownload;
  const sourcesBusy = sourcesState.managingSources || refreshing;
  const downloadsBusy = downloadsState.loadingDownloads;

  return (
    <AppShell activeTab={activeTab} accessToken={accessToken} busy={shellBusy} error={error} health={health} onAccessTokenChange={saveAccessToken} onRefresh={() => { void checkHealth(); void refresh(); }} onTabChange={setActiveTab}>
      {activeTab === "search" && <SearchView busy={searchBusy} sourceKey={sourceKey} detailSourceKey={detailSourceKey} sources={sourcesState.sources} keyword={keyword} searchMode={searchMode} aggregateSourceKeys={aggregateSourceKeys} aggregateResultLayout={aggregateResultLayout} results={results} aggregatedResults={aggregatedResults} details={details} episodeId={episodeId} selectedEpisodeIds={selectedEpisodeIds} previewImages={previewImages} hasSearched={hasSearched} searchPage={searchPage} searchMaxPage={searchMaxPage} canLoadMore={canLoadMore} downloadCreateStatus={downloadCreateStatus} onSourceChange={setSourceKey} onKeywordChange={setKeyword} onSearchModeChange={setSearchMode} onToggleAggregateSource={toggleAggregateSource} onAggregateResultLayoutChange={setAggregateResultLayout} onSearch={() => void submitSearch()} onLoadMore={() => void loadMoreResults()} onOpenComic={(comic, nextSourceKey) => void openComic(comic, nextSourceKey)} onDownloadComic={(comic, nextSourceKey) => void downloadComic(comic, nextSourceKey)} onPreviewEpisode={(id) => void previewEpisode(id)} onToggleSelectedEpisode={toggleSelectedEpisode} onSelectEpisodes={selectEpisodes} onCreateDownload={(mode) => void createDownload(mode)} />}

      {activeTab === "sources" && <SourcesView busy={sourcesBusy} sourceKey={sourceKey} installSource={sourcesState.installSource} availableSources={sourcesState.availableSources} sourceMetadata={sourcesState.sourceMetadata} sourceSettings={sourcesState.sourceSettings} settingsJson={sourcesState.settingsJson} cookieUrl={sourcesState.cookieUrl} cookieText={sourcesState.cookieText} onInstallSourceChange={sourcesState.setInstallSource} onSettingsJsonChange={sourcesState.setSettingsJson} onCookieUrlChange={sourcesState.setCookieUrl} onCookieTextChange={sourcesState.setCookieText} onInstallSelectedSource={() => void sourcesState.installSelectedSource(refresh)} onRefreshRepository={() => void sourcesState.refreshRepository()} onReloadSources={() => void sourcesState.reloadSources(refresh)} onLoadSourceSettings={() => void sourcesState.loadSourceSettings()} onSetSourceEnabled={(source, enabled) => void sourcesState.setSourceEnabled(source, enabled, refresh)} onSaveSourceSettings={() => void sourcesState.saveSourceSettings()} onResetSourceSettings={() => void sourcesState.resetSourceSettings()} onImportCookies={() => void sourcesState.importCookies()} onClearCookies={() => void sourcesState.clearCookies()} />}

      {activeTab === "history" && <HistoryView history={history} onOpenHistoryItem={(item, mode) => void openHistoryItem(item, mode)} />}

      {activeTab === "downloads" && <DownloadsView busy={downloadsBusy} cache={downloadsState.cache} downloads={downloadsState.downloads} downloadItems={downloadsState.downloadItems} failedItemsOnly={downloadsState.failedItemsOnly} onFailedItemsOnlyChange={downloadsState.setFailedItemsOnly} onPruneCache={() => void downloadsState.pruneCache()} onClearCache={() => void downloadsState.clearCache()} onLoadDownloadItems={(task) => void downloadsState.loadDownloadItems(task)} onDownloadAction={(task, action) => void downloadsState.downloadAction(task, action)} onRetryDownloadItem={(task, item) => void downloadsState.retryDownloadItem(task, item)} />}
    </AppShell>
  );
}
