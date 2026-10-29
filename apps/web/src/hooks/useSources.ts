import { useEffect, useState } from "react";
import { veneraApi } from "../api/venera.js";
import type { RepositorySource, SettingsResponse, Source, SourceMetadata } from "../types.js";

import type { SourceOperation } from "../features/sources/types.js";

type RunWith = (setLoading: (value: boolean) => void, task: () => Promise<void>) => Promise<void>;

export function useSources(
  runWith: RunWith,
  sourceKey: string,
  setSourceKey: (value: string) => void,
) {
  const [sources, setSources] = useState<Source[]>([]);
  const [availableSources, setAvailableSources] = useState<RepositorySource[]>([]);
  const [sourceMetadata, setSourceMetadata] = useState<SourceMetadata[]>([]);
  const [sourceSettings, setSourceSettings] = useState<SettingsResponse | null>(null);
  const [sourceSettingsKey, setSourceSettingsKey] = useState("");
  const [installSource, setInstallSource] = useState("");
  const [settingsJson, setSettingsJson] = useState("{}");
  const [cookieUrl, setCookieUrl] = useState("");
  const [cookieText, setCookieText] = useState("");
  const [sourceOperation, setSourceOperation] = useState<SourceOperation | null>(null);
  const [managingSources, setManagingSources] = useState(false);

  useEffect(() => {
    setSourceSettings(null);
    setSourceSettingsKey("");
    setSettingsJson("{}");
    setCookieUrl("");
    setCookieText("");
  }, [sourceKey]);

  async function loadSources() {
    const [loaded, metadata] = await Promise.all([
      veneraApi.listInstalledSources(),
      veneraApi.listSourceMetadata(),
    ]);
    setSources(loaded);
    setSourceMetadata(metadata);
    if (loaded[0] && !loaded.some((source) => source.key === sourceKey))
      changeSourceKey(loaded[0].key);
    let repository = await veneraApi.listAvailableSources();
    if (repository.length === 0) {
      repository = (await veneraApi.refreshRepository()).sources;
      setSourceMetadata(await veneraApi.listSourceMetadata());
    }
    setAvailableSources(repository);
    return loaded;
  }

  function changeSourceKey(value: string) {
    setSourceKey(value);
    setSourceSettings(null);
    setSourceSettingsKey("");
    setSettingsJson("{}");
    setCookieUrl("");
    setCookieText("");
  }

  async function loadSourceSettings(nextSourceKey = sourceKey) {
    await runWith(setManagingSources, async () => {
      const data = await veneraApi.getSourceSettings(nextSourceKey);
      setSourceSettings(data);
      setSourceSettingsKey(nextSourceKey);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function saveSourceSettings() {
    await runWith(setManagingSources, async () => {
      await veneraApi.updateSourceSettings(sourceKey, JSON.parse(settingsJson));
      await loadSourceSettings(sourceKey);
    });
  }

  async function resetSourceSettings() {
    await runWith(setManagingSources, async () => {
      const data = await veneraApi.clearSourceSettings(sourceKey);
      setSourceSettings(data);
      setSourceSettingsKey(sourceKey);
      setSettingsJson(JSON.stringify(data.values ?? {}, null, 2));
    });
  }

  async function importCookies() {
    await runWith(setManagingSources, async () => {
      const cookies = cookieText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      await veneraApi.importCookies(sourceKey, cookieUrl, cookies);
      setCookieText("");
    });
  }

  async function clearCookies() {
    if (!window.confirm(`清空源「${sourceKey}」的 Cookie？`)) return;
    await runWith(setManagingSources, async () => {
      await veneraApi.clearCookies(sourceKey);
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

  async function installSelectedSource(afterInstall: () => Promise<void>) {
    if (!installSource) return;
    await withSourceOperation({ kind: "install", label: "正在安装漫画源…" }, async () => {
      await veneraApi.installSource(installSource);
      await afterInstall();
    });
  }

  async function updateSource(key: string, afterUpdate: () => Promise<void>) {
    await withSourceOperation(
      { kind: "update", sourceKey: key, label: "正在更新漫画源…" },
      async () => {
        await veneraApi.installSource(key);
        await afterUpdate();
      },
    );
  }

  async function refreshRepository() {
    await withSourceOperation(
      { kind: "repository", label: "正在刷新仓库并检查更新…" },
      async () => {
        const data = await veneraApi.refreshRepository();
        setAvailableSources(data.sources ?? []);
        setSourceMetadata(await veneraApi.listSourceMetadata());
      },
    );
  }

  async function reloadSources(afterReload: () => Promise<void>) {
    await withSourceOperation({ kind: "reload", label: "正在重载已安装源…" }, async () => {
      await veneraApi.reloadSources();
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
        await veneraApi.setSourceEnabled(metadata.key, enabled);
        await afterChange();
      },
    );
  }

  return {
    availableSources,
    cookieText,
    cookieUrl,
    installSource,
    managingSources,
    sourceOperation,
    settingsJson,
    sourceSettingsKey,
    sourceMetadata,
    sourceSettings,
    sources,
    loadSources,
    setCookieText,
    setCookieUrl,
    setInstallSource,
    setSettingsJson,
    changeSourceKey,
    loadSourceSettings,
    saveSourceSettings,
    resetSourceSettings,
    importCookies,
    clearCookies,
    installSelectedSource,
    refreshRepository,
    updateSource,
    reloadSources,
    setSourceEnabled,
  };
}
