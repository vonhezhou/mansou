type Kind = "comic" | "novel";
type Action = "exposure" | "details" | "catalog" | "download" | "completed";
type Entry = {
  time: number;
  exposure: number;
  value: number;
  preferred: boolean;
  events: string[];
};
type Profile = Record<string, Entry>;
const key = (kind: Kind) => `mansou:source-interest:${kind}`;
const retentionMs = 30 * 24 * 3_600_000;

function read(kind: Kind): Profile {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(kind)) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value).filter(
      ([, item]) =>
        item &&
        typeof item === "object" &&
        Number.isFinite(item.time) &&
        Number.isFinite(item.exposure) &&
        item.exposure >= 0 &&
        Number.isFinite(item.value) &&
        item.value >= 0 &&
        typeof item.preferred === "boolean" &&
        Array.isArray(item.events) &&
        item.time > Date.now() - retentionMs,
    );
    return Object.fromEntries(entries.slice(-200));
  } catch {
    return {};
  }
}

function write(kind: Kind, profile: Profile) {
  try {
    localStorage.setItem(key(kind), JSON.stringify(profile));
  } catch {
    /* 本地存储不可用时继续搜索。 */
  }
}

export function sourcePreferences(kind: Kind) {
  return Object.fromEntries(
    Object.entries(read(kind)).map(([id, item]) => {
      const decay = 2 ** (-(Date.now() - item.time) / (7 * 24 * 3_600_000));
      return [
        id,
        item.preferred ? 10 : Math.min(8, (item.value / (item.exposure + 5)) * 8 * decay),
      ];
    }),
  );
}

export function recordSourceInterest(kind: Kind, id: string, action: Action, event: string) {
  const profile = read(kind);
  const entry = profile[id] ?? {
    time: Date.now(),
    exposure: 0,
    value: 0,
    preferred: false,
    events: [],
  };
  const token = `${action}:${event}`;
  if (entry.events.includes(token)) return;
  const decay = 2 ** (-(Date.now() - entry.time) / (7 * 24 * 3_600_000));
  entry.exposure *= decay;
  entry.value *= decay;
  entry.time = Date.now();
  if (action === "exposure") entry.exposure++;
  else entry.value += { details: 0.25, catalog: 0.5, download: 1, completed: 3 }[action];
  entry.events = [...entry.events, token].slice(-128);
  delete profile[id];
  profile[id] = entry;
  write(kind, Object.fromEntries(Object.entries(profile).slice(-200)));
}

export function isSourcePreferred(kind: Kind, id: string) {
  return read(kind)[id]?.preferred ?? false;
}
export function preferSource(kind: Kind, id: string, preferred: boolean) {
  const profile = read(kind);
  profile[id] = {
    ...(profile[id] ?? { exposure: 0, value: 0, events: [] }),
    preferred,
    time: Date.now(),
  };
  write(kind, Object.fromEntries(Object.entries(profile).slice(-200)));
}
export function resetSourceInterest(kind: Kind) {
  write(kind, {});
  try {
    localStorage.setItem(`${key(kind)}:downloads`, "{}");
  } catch {
    /* 存储不可用时保留本次操作。 */
  }
}

export function rememberInterestDownload(
  kind: Kind,
  sourceId: string,
  taskId: string,
  event = taskId,
) {
  recordSourceInterest(kind, sourceId, "download", event);
  // 只为当前浏览器创建过的任务记录完成奖励，排除其他用户及历史任务。
  try {
    const pending: Record<string, { sourceId: string; event: string }> = JSON.parse(
      localStorage.getItem(`${key(kind)}:downloads`) ?? "{}",
    );
    pending[taskId] = { sourceId, event };
    localStorage.setItem(
      `${key(kind)}:downloads`,
      JSON.stringify(Object.fromEntries(Object.entries(pending).slice(-200))),
    );
  } catch {
    /* 下载任务不依赖偏好持久化。 */
  }
}

export function observeInterestDownloads(kind: Kind, tasks: Array<{ id: string; status: string }>) {
  try {
    const pending: Record<string, { sourceId: string; event: string }> = JSON.parse(
      localStorage.getItem(`${key(kind)}:downloads`) ?? "{}",
    );
    for (const task of tasks) {
      if (!pending[task.id]) continue;
      if (task.status === "completed")
        recordSourceInterest(kind, pending[task.id].sourceId, "completed", pending[task.id].event);
      if (["completed", "cancelled"].includes(task.status)) delete pending[task.id];
    }
    localStorage.setItem(`${key(kind)}:downloads`, JSON.stringify(pending));
  } catch {
    /* 快照展示不依赖偏好持久化。 */
  }
}
