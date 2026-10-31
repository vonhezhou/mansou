import { NovelSourcesView } from "./features/novels/NovelSourcesView.js";
import { DownloadsWorkspace } from "./features/downloads/DownloadsWorkspace.js";
import { useNovelDownloads } from "./hooks/useNovelDownloads.js";
import { useNovelSources } from "./hooks/useNovelSources.js";
import { NovelsView } from "./features/novels/NovelsView.js";
import { useCallback, useEffect, useState } from "react";
import { downloadsEventUrl, mansouApi } from "./api/mansou.js";
import { AuthGate } from "./features/auth/AuthGate.js";
import { AccountPanel } from "./features/auth/AccountPanel.js";
import type { AuthSession } from "./api/auth.js";
import { AppShell } from "./app/AppShell.js";
import { isTabKey, type TabKey } from "./app/navigation.js";
import type { Health } from "./types.js";
import { LiveDownloadsView } from "./features/downloads/LiveDownloadsView.js";
import { SearchView } from "./features/search/SearchView.js";
import { SourcesView } from "./features/sources/SourcesView.js";
import { useDownloads } from "./hooks/useDownloads.js";
import { useSearch } from "./hooks/useSearch.js";
import { useSources } from "./hooks/useSources.js";
import { readSearchPreferences } from "./lib/searchPreferences.js";

function readInitialTab(): TabKey {
  const hash = window.location.hash.slice(1);
  return isTabKey(hash) ? hash : "search";
}

export function App() {
  return (
    <AuthGate>
      {(session, reload) => <Workspace session={session} reloadSession={reload} />}
    </AuthGate>
  );
}

function Workspace({
  session,
  reloadSession,
}: {
  session: AuthSession;
  reloadSession: () => Promise<void>;
}) {
  const [sourceKey, setSourceKey] = useState(() => readSearchPreferences().sourceKey);
  const [detailSourceKey, setDetailSourceKey] = useState(sourceKey);
  const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);
  const [health, setHealth] = useState<Health | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [downloadsReconnecting, setDownloadsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runWith = useCallback(
    async (setLoading: (value: boolean) => void, task: () => Promise<void>) => {
      setLoading(true);
      setError(null);
      try {
        await task();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );
  const downloadsState = useDownloads(runWith);
  const novelDownloads = useNovelDownloads();
  const novelSources = useNovelSources();
  const sourcesState = useSources(
    runWith,
    sourceKey,
    setSourceKey,
    activeTab === "sources" && !refreshing,
  );
  const searchState = useSearch({
    runWith,
    sourceKey,
    sources: sourcesState.sources,
    detailSourceKey,
    setSourceKey,
    setDetailSourceKey,
    setActiveTab: navigateTo,
    loadDownloads: downloadsState.loadDownloads,
  });

  useEffect(() => {
    void refresh();
    const events = new EventSource(downloadsEventUrl());
    events.addEventListener("downloads", (event) =>
      downloadsState.setDownloads(JSON.parse((event as MessageEvent).data)),
    );
    events.addEventListener("auth-expired", () => {
      events.close();
      window.dispatchEvent(new Event("mansou:unauthorized"));
    });
    events.onopen = () => setDownloadsReconnecting(false);
    events.onerror = () => {
      setDownloadsReconnecting(true);
      void reloadSession();
    };
    return () => events.close();
  }, []);

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    const navigate = () => setActiveTab(readInitialTab());
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  function navigateTo(tab: TabKey) {
    setActiveTab(tab);
    window.location.hash = tab;
  }

  async function checkHealth() {
    try {
      setHealth(await mansouApi.health());
    } catch {
      setHealth(null);
    }
  }

  async function refreshSources() {
    const loaded = await sourcesState.loadSources();
    searchState.syncAggregateSources(loaded);
  }

  async function refresh() {
    await runWith(setRefreshing, async () => {
      await Promise.all([
        refreshSources(),
        downloadsState.loadDownloads(),
        downloadsState.loadCacheStats(),
      ]);
    });
  }

  const sourcesBusy = sourcesState.managingSources || refreshing;
  const downloadsBusy = downloadsState.loadingDownloads || refreshing;

  return (
    <AppShell
      activeTab={activeTab}
      busy={refreshing}
      error={error}
      health={health}
      downloadStore={downloadsState.snapshotStore}
      novelDownloadStore={novelDownloads.store}
      sourceCount={sourcesState.sourceMetadata.length}
      novelSourceCount={novelSources.state.sources.length}
      onRefresh={() => {
        void checkHealth();
        void refresh();
        void novelDownloads.reload().catch(() => {});
        void novelSources.run(() => novelSources.reload());
      }}
      onTabChange={navigateTo}
      notice={
        downloadsReconnecting
          ? "下载状态连接已中断，正在自动重连；当前进度可能不是最新。"
          : undefined
      }
      account={
        session.mode === "required" ? (
          <AccountPanel username={session.username ?? "admin"} onSessionChange={reloadSession} />
        ) : undefined
      }
    >
      {activeTab === "search" && (
        <SearchView
          busy={searchState.searchBusy}
          sourcesLoading={refreshing}
          searching={searchState.searching}
          searchError={searchState.searchError}
          searchCancelled={searchState.searchCancelled}
          detailsBusy={searchState.detailsBusy}
          detailOperation={searchState.detailOperation}
          detailSummary={searchState.detailSummary}
          detailWorkError={searchState.detailWorkError}
          onRetryPreview={() => void searchState.previewEpisode(searchState.previewEpisodeId)}
          countingPages={searchState.countingPages}
          onStopCounting={searchState.stopCounting}
          aggregatePendingKeys={searchState.aggregatePendingKeys}
          onCancelSearch={searchState.cancelSearch}
          loadingDetails={searchState.loadingDetails}
          pendingComic={searchState.pendingComic}
          detailError={searchState.detailError}
          sourceKey={sourceKey}
          detailSourceKey={detailSourceKey}
          sources={sourcesState.sources}
          keyword={searchState.keyword}
          searchHistory={searchState.searchHistory}
          onRemoveSearchHistory={searchState.removeSearchHistory}
          onClearSearchHistory={searchState.clearSearchHistory}
          searchMode={searchState.searchMode}
          searchQuery={searchState.searchQuery}
          aggregateSourceKeys={searchState.aggregateSourceKeys}
          aggregateResultLayout={searchState.aggregateResultLayout}
          results={searchState.results}
          aggregatedResults={searchState.aggregatedResults}
          details={searchState.details}
          episodeId={searchState.episodeId}
          selectedEpisodeIds={searchState.selectedEpisodeIds}
          episodePageCounts={searchState.episodePageCounts}
          previewImages={searchState.previewImages}
          hasSearched={searchState.hasSearched}
          searchPage={searchState.searchPage}
          searchMaxPage={searchState.searchMaxPage}
          canLoadMore={searchState.canLoadMore}
          downloadCreateStatus={searchState.downloadCreateStatus}
          onSourceChange={sourcesState.changeSourceKey}
          onKeywordChange={searchState.setKeyword}
          onSearchModeChange={searchState.setSearchMode}
          onToggleAggregateSource={searchState.toggleAggregateSource}
          onSelectAggregateSources={searchState.selectAggregateSources}
          onAggregateResultLayoutChange={searchState.setAggregateResultLayout}
          onSearch={() => void searchState.submitSearch()}
          onLoadMore={() => void searchState.loadMoreResults()}
          onOpenComic={searchState.openComic}
          onCloseDetails={searchState.closeDetails}
          onPreviewEpisode={(id) => void searchState.previewEpisode(id)}
          onCountAllPages={() => void searchState.countAllPages()}
          onToggleSelectedEpisode={searchState.toggleSelectedEpisode}
          onSelectEpisodes={searchState.selectEpisodes}
          onCreateDownload={(mode) => void searchState.createDownload(mode)}
        />
      )}

      {activeTab === "novels" && (
        <NovelsView
          sourceState={novelSources}
          onNavigate={navigateTo}
          onDownloadCreated={novelDownloads.reload}
        />
      )}
      {activeTab === "novel-sources" && <NovelSourcesView sourceState={novelSources} />}

      {activeTab === "sources" && (
        <SourcesView
          error={error}
          metadataRefreshError={sourcesState.metadataRefreshError}
          busy={sourcesBusy}
          operation={sourcesState.sourceOperation}
          sourceKey={sourcesState.managedSourceKey}
          availableSources={sourcesState.availableSources}
          sourceMetadata={sourcesState.sourceMetadata}
          sourceSettings={sourcesState.sourceSettings}
          sourceSettingsKey={sourcesState.sourceSettingsKey}
          settingsJson={sourcesState.settingsJson}
          cookieUrl={sourcesState.cookieUrl}
          cookieText={sourcesState.cookieText}
          onSourceChange={sourcesState.changeManagedSource}
          onSettingsJsonChange={sourcesState.setSettingsJson}
          onCookieUrlChange={sourcesState.setCookieUrl}
          onCookieTextChange={sourcesState.setCookieText}
          onInstallSource={(source) => void sourcesState.installSource(source, refreshSources)}
          onUninstallSource={(source) => void sourcesState.uninstallSource(source, refreshSources)}
          onUpdateSource={(key) => void sourcesState.updateSource(key, refreshSources)}
          onRepositorySaved={sourcesState.repositorySaved}
          onRefreshRepository={() => void sourcesState.refreshRepository()}
          onReloadSources={() => void sourcesState.reloadSources(refreshSources)}
          onLoadSourceSettings={(key) => void sourcesState.loadSourceSettings(key)}
          onSetSourceEnabled={(source, enabled) =>
            void sourcesState.setSourceEnabled(source, enabled, refreshSources)
          }
          onSaveSourceSettings={() => void sourcesState.saveSourceSettings()}
          onResetSourceSettings={() => void sourcesState.resetSourceSettings()}
          onImportCookies={() => void sourcesState.importCookies()}
          onClearCookies={() => void sourcesState.clearCookies()}
        />
      )}

      {activeTab === "downloads" && (
        <DownloadsWorkspace
          comicStore={downloadsState.snapshotStore}
          novelStore={novelDownloads.store}
          novelError={novelDownloads.error}
          reloadNovels={novelDownloads.reload}
        >
          <LiveDownloadsView
            busy={downloadsBusy}
            taskOperations={downloadsState.taskOperations}
            taskMessages={downloadsState.taskMessages}
            taskErrors={downloadsState.taskErrors}
            itemErrors={downloadsState.itemErrors}
            cacheOperation={downloadsState.cacheOperation}
            cache={downloadsState.cache}
            store={downloadsState.snapshotStore}
            downloadItems={downloadsState.downloadItems}
            failedItemsOnly={downloadsState.failedItemsOnly}
            onFailedItemsOnlyChange={downloadsState.setFailedItemsOnly}
            onPruneCache={() => void downloadsState.pruneCache()}
            onClearCache={() => void downloadsState.clearCache()}
            onLoadDownloadItems={(task, offset) =>
              void downloadsState.loadDownloadItems(task, offset)
            }
            onDownloadAction={(task, action) => void downloadsState.downloadAction(task, action)}
            onRetryDownloadItem={(task, item) => void downloadsState.retryDownloadItem(task, item)}
          />
        </DownloadsWorkspace>
      )}
    </AppShell>
  );
}
