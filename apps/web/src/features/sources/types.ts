import type { RepositorySource, SettingsResponse, SourceMetadata } from "../../types.js";

export type SourceOperation = {
  kind: "install" | "update" | "enable" | "disable" | "repository" | "reload";
  sourceKey?: string;
  label: string;
};

export type SourcesViewProps = {
  busy: boolean;
  operation?: SourceOperation | null;
  sourceKey: string;
  installSource: string;
  availableSources: RepositorySource[];
  sourceMetadata: SourceMetadata[];
  sourceSettings: SettingsResponse | null;
  sourceSettingsKey: string;
  settingsJson: string;
  cookieUrl: string;
  cookieText: string;
  onInstallSourceChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSettingsJsonChange: (value: string) => void;
  onCookieUrlChange: (value: string) => void;
  onCookieTextChange: (value: string) => void;
  onInstallSelectedSource: () => void;
  onRefreshRepository: () => void;
  onUpdateSource: (key: string) => void;
  onReloadSources: () => void;
  onLoadSourceSettings: () => void;
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
  onSaveSourceSettings: () => void;
  onResetSourceSettings: () => void;
  onImportCookies: () => void;
  onClearCookies: () => void;
};
