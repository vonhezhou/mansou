// Match Flutter's release/hotfix ordering; build metadata does not affect ordering.
export function isNewerVersion(candidate: string, current: string) {
  const parse = (value: string) => {
    const parts = value.split("+")[0].replace("-", ".").split(".");
    const core = parts.slice(0, 3);
    if (!core.length || core.some((part) => !/^\d+$/.test(part)))
      throw new Error(`Invalid version: ${value}`);
    return { core: core.map(Number), suffix: parts[3] };
  };
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a.core[i] ?? 0) !== (b.core[i] ?? 0)) return (a.core[i] ?? 0) > (b.core[i] ?? 0);
  }
  if (a.suffix === b.suffix) return false;
  if (a.suffix == null) return b.suffix !== "hotfix";
  if (b.suffix == null) return a.suffix === "hotfix";
  return a.suffix > b.suffix;
}

export function checkSourceVersion(minAppVersion: unknown, appVersion: string) {
  if (minAppVersion == null || minAppVersion === "") return;
  if (typeof minAppVersion !== "string" || isNewerVersion(minAppVersion, appVersion)) {
    throw new Error(`minAppVersion ${String(minAppVersion)} is required (runtime ${appVersion})`);
  }
}
