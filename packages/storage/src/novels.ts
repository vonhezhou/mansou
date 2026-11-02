import type Database from "better-sqlite3";

type Kind = "source" | "subscription" | "task" | "plan" | "session";

/** 小说状态独立存储；规则和下载计划保留快照，不随订阅刷新改变。 */
export class NovelStorage {
  constructor(private readonly db: Database.Database) {}
  list<T>(kind: Kind): T[] {
    return (
      this.db
        .prepare("select value_json from novel_records where kind = ? order by rowid")
        .all(kind) as Array<{ value_json: string }>
    ).map((row) => JSON.parse(row.value_json) as T);
  }
  get<T>(kind: Kind, id: string): T | undefined {
    const row = this.db
      .prepare("select value_json from novel_records where kind = ? and id = ?")
      .get(kind, id) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }
  save(kind: Kind, id: string, value: unknown) {
    this.db
      .prepare(
        "insert into novel_records(kind, id, value_json) values (?, ?, ?) on conflict(kind, id) do update set value_json = excluded.value_json",
      )
      .run(kind, id, JSON.stringify(value));
  }
  delete(kind: Kind, id: string) {
    this.db.prepare("delete from novel_records where kind = ? and id = ?").run(kind, id);
  }
  transaction(work: () => void) {
    this.db.transaction(work)();
  }
}
