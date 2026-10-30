import { useEffect, useState } from "react";
import { downloadsEventUrl, veneraApi } from "./api/venera.js";
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
  const [sourceKey, setSourceKey] = useState("mock");
  const [detailSourceKey, setDetailSourceKey] = useState(sourceKey);
  const [activeTab, setActiveTab] = useState<TabKey>(readInitialTab);
  const [health, setHealth] = useState<Health | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [downloadsReconnecting, setDownloadsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadsState = useDownloads(runWith);
  const sourcesState = useSources(runWith, sourceKey, setSourceKey);
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
      window.dispatchEvent(new Event("venera:unauthorized"));
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
      sourceCount={sourcesState.sourceMetadata.length}
      onRefresh={() => {
        void checkHealth();
        void refresh();
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
          onAggregateResultLayoutChange={searchState.setAggregateResultLayout}
          onSearch={() => void searchState.submitSearch()}
          onLoadMore={() => void searchState.loadMoreResults()}
          onOpenComic={(comic, nextSourceKey) => void searchState.openComic(comic, nextSourceKey)}
          onCloseDetails={searchState.closeDetails}
          onPreviewEpisode={(id) => void searchState.previewEpisode(id)}
          onCountAllPages={() => void searchState.countAllPages()}
          onToggleSelectedEpisode={searchState.toggleSelectedEpisode}
          onSelectEpisodes={searchState.selectEpisodes}
          onCreateDownload={(mode) => void searchState.createDownload(mode)}
        />
      )}

      {activeTab === "sources" && (
        <SourcesView
          busy={sourcesBusy}
          operation={sourcesState.sourceOperation}
          sourceKey={sourceKey}
          installSource={sourcesState.installSource}
          availableSources={sourcesState.availableSources}
          sourceMetadata={sourcesState.sourceMetadata}
          sourceSettings={sourcesState.sourceSettings}
          sourceSettingsKey={sourcesState.sourceSettingsKey}
          settingsJson={sourcesState.settingsJson}
          cookieUrl={sourcesState.cookieUrl}
          cookieText={sourcesState.cookieText}
          onSourceChange={sourcesState.changeSourceKey}
          onInstallSourceChange={sourcesState.setInstallSource}
          onSettingsJsonChange={sourcesState.setSettingsJson}
          onCookieUrlChange={sourcesState.setCookieUrl}
          onCookieTextChange={sourcesState.setCookieText}
          onInstallSelectedSource={() => void sourcesState.installSelectedSource(refreshSources)}
          onUpdateSource={(key) => void sourcesState.updateSource(key, refreshSources)}
          onRefreshRepository={() => void sourcesState.refreshRepository()}
          onReloadSources={() => void sourcesState.reloadSources(refreshSources)}
          onLoadSourceSettings={() => void sourcesState.loadSourceSettings()}
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
        <LiveDownloadsView
          busy={downloadsBusy}
          taskOperations={downloadsState.taskOperations}
          taskMessages={downloadsState.taskMessages}
          itemErrors={downloadsState.itemErrors}
          cacheOperation={downloadsState.cacheOperation}
          cache={downloadsState.cache}
          store={downloadsState.snapshotStore}
          downloadItems={downloadsState.downloadItems}
          failedItemsOnly={downloadsState.failedItemsOnly}
          onFailedItemsOnlyChange={downloadsState.setFailedItemsOnly}
          onPruneCache={() => void downloadsState.pruneCache()}
          onClearCache={() => void downloadsState.clearCache()}
          onLoadDownloadItems={(task) => void downloadsState.loadDownloadItems(task)}
          onDownloadAction={(task, action) => void downloadsState.downloadAction(task, action)}
          onRetryDownloadItem={(task, item) => void downloadsState.retryDownloadItem(task, item)}
        />
      )}
    </AppShell>
  );
}
