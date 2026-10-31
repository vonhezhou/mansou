import type { RepositorySource, SettingsResponse, SourceMetadata } from "../../types.js";

export type SourceOperation = {
  kind: "install" | "uninstall" | "update" | "enable" | "disable" | "repository" | "reload";
  sourceKey?: string;
  label: string;
};

export type SourcesViewProps = {
  error?: string | null;
  metadataRefreshError?: boolean;
  busy: boolean;
  operation?: SourceOperation | null;
  sourceKey: string;
  availableSources: RepositorySource[];
  sourceMetadata: SourceMetadata[];
  sourceSettings: SettingsResponse | null;
  sourceSettingsKey: string;
  settingsJson: string;
  cookieUrl: string;
  cookieText: string;
  onSourceChange: (value: string) => void;
  onSettingsJsonChange: (value: string) => void;
  onCookieUrlChange: (value: string) => void;
  onCookieTextChange: (value: string) => void;
  onInstallSource: (source: string) => void;
  onUninstallSource: (source: SourceMetadata) => void;
  onRefreshRepository: () => void;
  onUpdateSource: (key: string) => void;
  onReloadSources: () => void;
  onLoadSourceSettings: (key?: string) => void;
  onSetSourceEnabled: (source: SourceMetadata, enabled: boolean) => void;
  onSaveSourceSettings: () => void;
  onResetSourceSettings: () => void;
  onImportCookies: () => void;
  onClearCookies: () => void;
};
