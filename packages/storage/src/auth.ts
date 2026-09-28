import type Database from "better-sqlite3";

export type Admin = { username: string; passwordHash: string; revision: number };
export type Session = { hash: string; csrfToken: string; expiresAt: number };
export type ApiToken = { id: string; name: string; createdAt: number; expiresAt: number | null };

export class AuthStorage {
  constructor(private readonly db: Database.Database) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_admin (
          id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL,
          password_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
          hash TEXT PRIMARY KEY, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
        CREATE TABLE IF NOT EXISTS auth_tokens (
          id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          created_at INTEGER NOT NULL, expires_at INTEGER
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (5, datetime('now'));
      `);
    })();
  }

  admin(): Admin | undefined {
    return this.db
      .prepare(
        "SELECT username, password_hash AS passwordHash, revision FROM auth_admin WHERE id = 1",
      )
      .get() as Admin | undefined;
  }

  createAdmin(username: string, passwordHash: string) {
    this.db
      .prepare(
        "INSERT INTO auth_admin(id, username, password_hash, updated_at) VALUES (1, ?, ?, ?)",
      )
      .run(username, passwordHash, Date.now());
  }

  changePassword(passwordHash: string, revision: number) {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          "UPDATE auth_admin SET password_hash = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?",
        )
        .run(passwordHash, Date.now(), revision);
      if (!result.changes) return false;
      this.db.prepare("DELETE FROM auth_sessions").run();
      return true;
    })();
  }

  createSession(session: Session, revision: number) {
    return this.db.transaction(() => {
      if (this.admin()?.revision !== revision) return false;
      this.db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now());
      this.db
        .prepare("INSERT INTO auth_sessions(hash, csrf_token, expires_at) VALUES (?, ?, ?)")
        .run(session.hash, session.csrfToken, session.expiresAt);
      return true;
    })();
  }

  session(hash: string): Session | undefined {
    return this.db
      .prepare(
        "SELECT hash, csrf_token AS csrfToken, expires_at AS expiresAt FROM auth_sessions WHERE hash = ? AND expires_at > ?",
      )
      .get(hash, Date.now()) as Session | undefined;
  }

  deleteSession(hash: string) {
    this.db.prepare("DELETE FROM auth_sessions WHERE hash = ?").run(hash);
  }
  pruneSessions() {
    this.db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now());
  }

  createToken(token: ApiToken, hash: string) {
    this.db
      .prepare(
        "INSERT INTO auth_tokens(id, hash, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(token.id, hash, token.name, token.createdAt, token.expiresAt);
  }
  tokens(): ApiToken[] {
    return this.db
      .prepare(
        "SELECT id, name, created_at AS createdAt, expires_at AS expiresAt FROM auth_tokens ORDER BY created_at DESC",
      )
      .all() as ApiToken[];
  }
  token(hash: string): ApiToken | undefined {
    return this.db
      .prepare(
        "SELECT id, name, created_at AS createdAt, expires_at AS expiresAt FROM auth_tokens WHERE hash = ? AND (expires_at IS NULL OR expires_at > ?)",
      )
      .get(hash, Date.now()) as ApiToken | undefined;
  }
  deleteToken(id: string) {
    return this.db.prepare("DELETE FROM auth_tokens WHERE id = ?").run(id).changes > 0;
  }
}
