import { useEffect, useState } from "react";
import { veneraApi } from "../api/venera.js";
import type { RepositorySource, SettingsResponse, Source, SourceMetadata } from "../types.js";

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
  const [managingSources, setManagingSources] = useState(false);

  useEffect(() => {
    setSourceSettings(null);
    setSourceSettingsKey("");
    setSettingsJson("{}");
    setCookieUrl("");
    setCookieText("");
  }, [sourceKey]);

  async function loadSources() {
    const loaded = await veneraApi.listInstalledSources();
    const metadata = await veneraApi.listSourceMetadata();
    const repository = await veneraApi.listAvailableSources();
    setSources(loaded);
    setSourceMetadata(metadata);
    setAvailableSources(repository);
    if (loaded[0] && !loaded.some((source) => source.key === sourceKey))
      changeSourceKey(loaded[0].key);
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

  async function installSelectedSource(afterInstall: () => Promise<void>) {
    if (!installSource) return;
    await runWith(setManagingSources, async () => {
      await veneraApi.installSource(installSource);
      await afterInstall();
    });
  }

  async function refreshRepository() {
    await runWith(setManagingSources, async () => {
      const data = await veneraApi.refreshRepository();
      setAvailableSources(data.sources ?? []);
    });
  }

  async function reloadSources(afterReload: () => Promise<void>) {
    await runWith(setManagingSources, async () => {
      await veneraApi.reloadSources();
      await afterReload();
    });
  }

  async function setSourceEnabled(
    metadata: SourceMetadata,
    enabled: boolean,
    afterChange: () => Promise<void>,
  ) {
    await runWith(setManagingSources, async () => {
      await veneraApi.setSourceEnabled(metadata.key, enabled);
      await afterChange();
    });
  }

  return {
    availableSources,
    cookieText,
    cookieUrl,
    installSource,
    managingSources,
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
    reloadSources,
    setSourceEnabled,
  };
}
