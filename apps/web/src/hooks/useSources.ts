import { useEffect, useState } from "react";
import { mansouApi } from "../api/mansou.js";
import type { RepositorySource, SettingsResponse, Source, SourceMetadata } from "../types.js";

import type { SourceOperation } from "../features/sources/types.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

export function useSources(
  runWith: RunWith,
  sourceKey: string,
  setSourceKey: (value: string) => void,
  metadataActive = false,
) {
  const [managedSourceKey, setManagedSourceKey] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [availableSources, setAvailableSources] = useState<RepositorySource[]>([]);
  const [sourceMetadata, setSourceMetadata] = useState<SourceMetadata[]>([]);
  const [sourceSettings, setSourceSettings] = useState<SettingsResponse | null>(null);
  const [sourceSettingsKey, setSourceSettingsKey] = useState("");
  const [settingsJson, setSettingsJson] = useState("{}");
  const [cookieUrl, setCookieUrl] = useState("");
  const [cookieText, setCookieText] = useState("");
  const [sourceOperation, setSourceOperation] = useState<SourceOperation | null>(null);
  const [managingSources, setManagingSources] = useState(false);
  const [metadataRefreshError, setMetadataRefreshError] = useState(false);

  useEffect(() => {
    if (!metadataActive || managingSources) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refreshMetadata() {
      try {
        const metadata = await mansouApi.listSourceMetadata();
        if (!cancelled) {
          setSourceMetadata(metadata);
          setMetadataRefreshError(false);
        }
      } catch {
        if (!cancelled) setMetadataRefreshError(true);
      } finally {
        if (!cancelled) timer = setTimeout(refreshMetadata, 30_000);
      }
    }
    void refreshMetadata();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [metadataActive, managingSources]);

  useEffect(() => {
    if (!sourceMetadata.some((source) => source.key === managedSourceKey))
      changeManagedSource(sourceMetadata[0]?.key ?? "");
  }, [sourceMetadata, managedSourceKey]);

  function changeManagedSource(value: string) {
    setManagedSourceKey(value);
    setSourceSettings(null);
    setSourceSettingsKey("");
    setSettingsJson("{}");
    setCookieUrl("");
    setCookieText("");
  }

  async function loadSources() {
    const [loaded, metadata] = await Promise.all([
      mansouApi.listInstalledSources(),
      mansouApi.listSourceMetadata(),
    ]);
    setSources(loaded);
    setSourceMetadata(metadata);
    const searchable = loaded.filter((source) => source.hasSearch);
    if (!searchable.some((source) => source.key === sourceKey))
      changeSourceKey(searchable[0]?.key ?? "");
    let repository = await mansouApi.listAvailableSources();
    if (repository.length === 0) {
      repository = (await mansouApi.refreshRepository()).sources;
      setSourceMetadata(await mansouApi.listSourceMetadata());
    }
    setAvailableSources(repository);
    return loaded;
  }

  function changeSourceKey(value: string) {
    setSourceKey(value);
  }

  async function loadSourceSettings(nextSourceKey = managedSourceKey) {
    await runWith(setManagingSources, async () => {
      const data = await mansouApi.getSourceSettings(nextSourceKey);
      setSourceSettings(data);
      setSourceSettingsKey(nextSourceKey);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function saveSourceSettings() {
    await runWith(setManagingSources, async () => {
      await mansouApi.updateSourceSettings(managedSourceKey, JSON.parse(settingsJson));
      await loadSourceSettings(managedSourceKey);
    });
  }

  async function resetSourceSettings() {
    await runWith(setManagingSources, async () => {
      const data = await mansouApi.clearSourceSettings(managedSourceKey);
      setSourceSettings(data);
      setSourceSettingsKey(managedSourceKey);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function importCookies() {
    await runWith(setManagingSources, async () => {
      const cookies = cookieText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      await mansouApi.importCookies(managedSourceKey, cookieUrl, cookies);
      setCookieText("");
    });
  }

  async function clearCookies() {
    if (!window.confirm(`清空源「${managedSourceKey}」的 Cookie？`)) return;
    await runWith(setManagingSources, async () => {
      await mansouApi.clearCookies(managedSourceKey);
      setCookieText("");
    });
  }

  async function withSourceOperation(operation: SourceOperation, task: () => Promise<void>) {
    setSourceOperation(operation);
    try {
      await runWith(setManagingSources, task);
    } finally {
      setSourceOperation(null);
    }
  }

  async function installSource(source: string, afterInstall: () => Promise<void>) {
    await withSourceOperation(
      { kind: "install", sourceKey: source, label: "正在安装漫画源…" },
      async () => {
        await mansouApi.installSource(source);
        await afterInstall();
      },
    );
  }

  async function uninstallSource(source: SourceMetadata, afterUninstall: () => Promise<void>) {
    if (
      !window.confirm(
        `卸载「${source.name}」？源配置、账号和 Cookie 将被清除，下载记录与文件会保留。未完成的下载需要重新安装该源后才能继续。`,
      )
    )
      return;
    await withSourceOperation(
      { kind: "uninstall", sourceKey: source.key, label: `正在卸载「${source.name}」…` },
      async () => {
        await mansouApi.uninstallSource(source.key);
        await afterUninstall();
      },
    );
  }

  async function updateSource(key: string, afterUpdate: () => Promise<void>) {
    await withSourceOperation(
      { kind: "update", sourceKey: key, label: "正在更新漫画源…" },
      async () => {
        await mansouApi.installSource(key);
        await afterUpdate();
      },
    );
  }

  async function refreshRepository() {
    await withSourceOperation(
      { kind: "repository", label: "正在刷新仓库并检查更新…" },
      async () => {
        const data = await mansouApi.refreshRepository();
        setAvailableSources(data.sources ?? []);
        setSourceMetadata(await mansouApi.listSourceMetadata());
      },
    );
  }

  async function reloadSources(afterReload: () => Promise<void>) {
    await withSourceOperation({ kind: "reload", label: "正在重载已安装源…" }, async () => {
      await mansouApi.reloadSources();
      await afterReload();
    });
  }

  async function setSourceEnabled(
    metadata: SourceMetadata,
    enabled: boolean,
    afterChange: () => Promise<void>,
  ) {
    await withSourceOperation(
      {
        kind: enabled ? "enable" : "disable",
        sourceKey: metadata.key,
        label: `正在${enabled ? "启用" : "禁用"}「${metadata.name}」…`,
      },
      async () => {
        await mansouApi.setSourceEnabled(metadata.key, enabled);
        await afterChange();
      },
    );
  }

  return {
    managedSourceKey,
    changeManagedSource,
    availableSources,
    cookieText,
    cookieUrl,
    managingSources,
    sourceOperation,
    settingsJson,
    sourceSettingsKey,
    sourceMetadata,
    metadataRefreshError,
    sourceSettings,
    sources,
    loadSources,
    setCookieText,
    setCookieUrl,
    setSettingsJson,
    changeSourceKey,
    loadSourceSettings,
    saveSourceSettings,
    resetSourceSettings,
    importCookies,
    clearCookies,
    installSource,
    uninstallSource,
    refreshRepository,
    updateSource,
    reloadSources,
    setSourceEnabled,
  };
}
