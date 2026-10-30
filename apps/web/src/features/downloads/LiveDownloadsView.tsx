import { useSyncExternalStore } from "react";
import type { DownloadSnapshotStore } from "../../lib/downloadSnapshot.js";
import { DownloadsView } from "./DownloadsView.js";
import type { DownloadsViewProps } from "./types.js";

export function LiveDownloadsView({
  store,
  ...props
}: Omit<DownloadsViewProps, "downloads"> & { store: DownloadSnapshotStore }) {
  const downloads = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <DownloadsView {...props} downloads={downloads} />;
}
