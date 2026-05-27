import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type StorageDatabase = ReturnType<typeof createStorage>;

export function createStorage(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "venera_web.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return new AppStorage(db);
}

class AppStorage {
  constructor(private readonly db: Database.Database) {}

  close() {
    this.db.close();
  }

  getPluginData(sourceKey: string, key: string) {
    const row = this.db
      .prepare("select value_json from plugin_data where source_key = ? and key = ?")
      .get(sourceKey, key) as { value_json: string } | undefined;
    return row ? JSON.parse(row.value_json) : undefined;
  }

  setPluginData(sourceKey: string, key: string, value: unknown) {
    this.db
      .prepare("insert into plugin_data(source_key, key, value_json, updated_at) values (?, ?, ?, ?) on conflict(source_key, key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at")
      .run(sourceKey, key, JSON.stringify(value), new Date().toISOString());
  }

  deletePluginData(sourceKey: string, key: string) {
    this.db.prepare("delete from plugin_data where source_key = ? and key = ?").run(sourceKey, key);
  }

  listSources() {
    return this.db.prepare("select * from sources order by name asc").all();
  }

  getSource(key: string) {
    return this.db.prepare("select * from sources where key = ?").get(key) ?? null;
  }

  upsertSource(input: { key: string; name: string; version?: string; scriptPath?: string; scriptUrl?: string; hash?: string; enabled?: boolean }) {
    const now = new Date().toISOString();
    this.db
      .prepare("insert into sources(key, name, version, enabled, script_path, script_url, hash, installed_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(key) do update set name = excluded.name, version = excluded.version, script_path = excluded.script_path, script_url = excluded.script_url, hash = excluded.hash, updated_at = excluded.updated_at")
      .run(input.key, input.name, input.version ?? null, input.enabled === false ? 0 : 1, input.scriptPath ?? null, input.scriptUrl ?? null, input.hash ?? null, now, now);
    return this.getSource(input.key);
  }

  setSourceEnabled(key: string, enabled: boolean) {
    this.db.prepare("update sources set enabled = ?, updated_at = ? where key = ?").run(enabled ? 1 : 0, new Date().toISOString(), key);
    return this.getSource(key);
  }

  getSourceSettings(sourceKey: string) {
    const rows = this.db
      .prepare("select key, value_json from source_settings where source_key = ?")
      .all(sourceKey) as Array<{ key: string; value_json: string }>;
    return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value_json)]));
  }

  setSourceSettings(sourceKey: string, values: Record<string, unknown>) {
    const now = new Date().toISOString();
    const insert = this.db.prepare("insert into source_settings(source_key, key, value_json, updated_at) values (?, ?, ?, ?) on conflict(source_key, key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at");
    const tx = this.db.transaction(() => {
      this.db.prepare("delete from source_settings where source_key = ?").run(sourceKey);
      for (const [key, value] of Object.entries(values)) insert.run(sourceKey, key, JSON.stringify(value), now);
    });
    tx();
  }

  clearSourceSettings(sourceKey: string) {
    this.db.prepare("delete from source_settings where source_key = ?").run(sourceKey);
  }

  getCookieJar(sourceKey: string) {
    const row = this.db.prepare("select jar_json from source_cookies where source_key = ?").get(sourceKey) as { jar_json: string } | undefined;
    return row ? JSON.parse(row.jar_json) : null;
  }

  setCookieJar(sourceKey: string, jar: unknown) {
    this.db
      .prepare("insert into source_cookies(source_key, jar_json, updated_at) values (?, ?, ?) on conflict(source_key) do update set jar_json = excluded.jar_json, updated_at = excluded.updated_at")
      .run(sourceKey, JSON.stringify(jar), new Date().toISOString());
  }

  listDownloads() {
    const rows = this.db.prepare("select task_json from downloads order by created_at asc").all() as Array<{ task_json: string }>;
    return rows.map((row) => JSON.parse(row.task_json));
  }

  saveDownload(task: Record<string, unknown>) {
    this.db
      .prepare("insert into downloads(id, source_key, comic_id, episode_id, status, task_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set source_key = excluded.source_key, comic_id = excluded.comic_id, episode_id = excluded.episode_id, status = excluded.status, task_json = excluded.task_json, updated_at = excluded.updated_at")
      .run(
        String(task.id),
        String(task.sourceKey),
        String(task.comicId),
        String(task.episodeId ?? ""),
        String(task.status),
        JSON.stringify(task),
        String(task.createdAt),
        String(task.updatedAt),
      );
  }

  deleteDownload(id: string) {
    this.db.prepare("delete from downloads where id = ?").run(id);
  }

  saveDownloads(tasks: Array<Record<string, unknown>>) {
    const insert = this.db.prepare("insert into downloads(id, source_key, comic_id, episode_id, status, task_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set source_key = excluded.source_key, comic_id = excluded.comic_id, episode_id = excluded.episode_id, status = excluded.status, task_json = excluded.task_json, updated_at = excluded.updated_at");
    const tx = this.db.transaction(() => {
      const ids = new Set(tasks.map((task) => String(task.id)));
      for (const row of this.db.prepare("select id from downloads").all() as Array<{ id: string }>) {
        if (!ids.has(row.id)) this.db.prepare("delete from downloads where id = ?").run(row.id);
      }
      for (const task of tasks) {
        insert.run(
          String(task.id),
          String(task.sourceKey),
          String(task.comicId),
          String(task.episodeId ?? ""),
          String(task.status),
          JSON.stringify(task),
          String(task.createdAt),
          String(task.updatedAt),
        );
      }
    });
    tx();
  }

  saveDownloadItem(input: { taskId: string; imageKey: string; filePath?: string; status: string; retryCount?: number; error?: string; errorCode?: string }) {
    const id = `${input.taskId}:${input.imageKey}`;
    this.db
      .prepare("insert into download_items(id, task_id, image_key, file_path, status, retry_count, error, error_code, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set file_path = excluded.file_path, status = excluded.status, retry_count = excluded.retry_count, error = excluded.error, error_code = excluded.error_code, updated_at = excluded.updated_at")
      .run(id, input.taskId, input.imageKey, input.filePath ?? null, input.status, input.retryCount ?? 0, input.error ?? null, input.errorCode ?? null, new Date().toISOString());
  }

  getDownloadItem(taskId: string, imageKey: string) {
    return this.db.prepare("select * from download_items where task_id = ? and image_key = ?").get(taskId, imageKey) ?? null;
  }

  listDownloadItems(taskId: string) {
    return this.db.prepare("select * from download_items where task_id = ? order by id asc").all(taskId);
  }

  deleteDownloadItems(taskId: string) {
    this.db.prepare("delete from download_items where task_id = ?").run(taskId);
  }

  listHistory() {
    return this.db.prepare("select * from history order by updated_at desc limit 100").all();
  }

  getHistory(sourceKey: string, comicId: string) {
    return this.db.prepare("select * from history where source_key = ? and comic_id = ?").get(sourceKey, comicId) ?? null;
  }

  saveHistory(input: { sourceKey: string; comicId: string; title?: string; cover?: string; episodeId?: string; page?: number; progress?: number }) {
    const id = `${input.sourceKey}:${input.comicId}`;
    const now = new Date().toISOString();
    this.db
      .prepare("insert into history(id, source_key, comic_id, title, cover, episode_id, page, progress, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set title = coalesce(excluded.title, history.title), cover = coalesce(excluded.cover, history.cover), episode_id = excluded.episode_id, page = excluded.page, progress = excluded.progress, updated_at = excluded.updated_at")
      .run(id, input.sourceKey, input.comicId, input.title ?? null, input.cover ?? null, input.episodeId ?? null, input.page ?? 0, input.progress ?? 0, now);
    return this.getHistory(input.sourceKey, input.comicId);
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );
  `);
  const current = db.prepare("select max(version) as version from schema_migrations").get() as { version: number | null };
  const version = current.version ?? 0;
  if (version < 1) {
    db.exec(`
    create table if not exists sources (
      key text primary key,
      name text not null,
      version text,
      enabled integer not null default 1,
      script_path text,
      script_url text,
      hash text,
      installed_at text,
      updated_at text
    );
    create table if not exists source_settings (
      source_key text not null,
      key text not null,
      value_json text not null,
      updated_at text not null,
      primary key (source_key, key)
    );
    create table if not exists source_cookies (
      source_key text primary key,
      jar_json text not null,
      updated_at text not null
    );
    create table if not exists plugin_data (
      source_key text not null,
      key text not null,
      value_json text not null,
      updated_at text not null,
      primary key (source_key, key)
    );
    create table if not exists history (
      id text primary key,
      user_id text,
      source_key text not null,
      comic_id text not null,
      episode_id text,
      page integer not null default 0,
      progress real not null default 0,
      updated_at text not null
    );
    create table if not exists favorites (
      id text primary key,
      user_id text,
      source_key text not null,
      comic_id text not null,
      title text,
      cover text,
      created_at text not null
    );
    create table if not exists downloads (
      id text primary key,
      source_key text not null,
      comic_id text not null,
      episode_id text,
      status text not null,
      task_json text not null,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists download_items (
      id text primary key,
      task_id text not null,
      image_key text not null,
      file_path text,
      status text not null,
      retry_count integer not null default 0,
      error text,
      error_code text,
      updated_at text not null
    );
    create table if not exists cache_entries (
      key text primary key,
      file_path text not null,
      size integer not null default 0,
      content_type text,
      accessed_at text not null,
      created_at text not null
    );
    create table if not exists app_settings (
      key text primary key,
      value_json text not null,
      updated_at text not null
    );
    create index if not exists idx_download_items_task_id on download_items(task_id);
    create index if not exists idx_history_source_comic on history(source_key, comic_id);
    insert into schema_migrations(version, applied_at) values (1, datetime('now'));
  `);
  }
  if (version < 2) {
    const columns = db.prepare("pragma table_info(sources)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("script_url")) db.exec("alter table sources add column script_url text");
    if (!names.has("hash")) db.exec("alter table sources add column hash text");
    db.exec("insert into schema_migrations(version, applied_at) values (2, datetime('now'))");
  }
  if (version < 3) {
    const columns = db.prepare("pragma table_info(download_items)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("error_code")) db.exec("alter table download_items add column error_code text");
    db.exec("insert into schema_migrations(version, applied_at) values (3, datetime('now'))");
  }
  if (version < 4) {
    const columns = db.prepare("pragma table_info(history)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("title")) db.exec("alter table history add column title text");
    if (!names.has("cover")) db.exec("alter table history add column cover text");
    db.exec("insert into schema_migrations(version, applied_at) values (4, datetime('now'))");
  }
}
