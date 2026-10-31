export function sourceKeyFor(subscriptionId: string, originalKey: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(subscriptionId) || !originalKey)
    throw new Error("Invalid source identity");
  return `${subscriptionId}:${encodeURIComponent(originalKey)}`;
}

export function parseSourceKey(key: string) {
  const separator = key.indexOf(":");
  if (separator < 1) return null;
  try {
    const subscriptionId = key.slice(0, separator);
    const originalKey = decodeURIComponent(key.slice(separator + 1));
    if (sourceKeyFor(subscriptionId, originalKey) !== key) return null;
    return { subscriptionId, originalKey };
  } catch {
    return null;
  }
}
