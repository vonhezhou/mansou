import type Database from "better-sqlite3";

/** 质量记录与源类型、身份绑定；同步事务保证并发完成的操作不会覆盖计数。 */
export class SourceQualityStorage {
  constructor(private readonly db: Database.Database) {}

  get<T>(kind: string, key: string): T | undefined {
    const row = this.db
      .prepare("select value_json from source_quality where kind = ? and source_key = ?")
      .get(kind, key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }

  update<T>(kind: string, key: string, change: (current: T | undefined) => T | undefined) {
    return this.db
      .transaction(() => {
        const value = change(this.get<T>(kind, key));
        if (value === undefined) return;
        this.db
          .prepare(
            `insert into source_quality(kind, source_key, value_json) values (?, ?, ?)
        on conflict(kind, source_key) do update set value_json = excluded.value_json`,
          )
          .run(kind, key, JSON.stringify(value));
        return value;
      })
      .immediate();
  }

  delete(kind: string, key: string) {
    this.db.prepare("delete from source_quality where kind = ? and source_key = ?").run(kind, key);
  }
}
