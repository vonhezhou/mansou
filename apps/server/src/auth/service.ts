import { randomUUID } from "node:crypto";
import type { StorageDatabase, Session } from "@mansou/storage";
import { AppError } from "../errors.js";
import type { AuthConfig } from "./config.js";
import { hashPassword, randomSecret, secretHash, verifyPassword } from "./password.js";

export type Identity =
  | { kind: "none" }
  | { kind: "session"; session: Session }
  | { kind: "token"; hash: string };

export class AuthService {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private activeVerifications = 0;
  constructor(
    private readonly storage: StorageDatabase,
    readonly config: AuthConfig,
  ) {}

  // Bound both expensive password work and per-address state. Proxy headers are not trusted.
  private limit(ip: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    for (const [key, max] of [
      ["global", 30],
      [`ip:${ip}`, 5],
    ] as const) {
      const value = this.attempts.get(key) ?? { count: 0, until: now + 60000 };
      if (++value.count > max)
        throw new AppError("AUTH_RATE_LIMITED", "尝试过于频繁，请一分钟后重试");
      this.attempts.set(key, value);
    }
    if (this.activeVerifications >= 2) throw new AppError("AUTH_RATE_LIMITED", "请稍后重试");
  }

  async verify(ip: string, username: string, password: string) {
    this.limit(ip);
    const admin = this.storage.auth.admin();
    if (!admin) throw new AppError("INVALID_CREDENTIALS", "用户名或密码不正确，或管理员尚未初始化");
    this.activeVerifications++;
    try {
      const matches = await verifyPassword(admin.passwordHash, password);
      if (!matches || username !== admin.username)
        throw new AppError("INVALID_CREDENTIALS", "用户名或密码不正确");
      if (this.storage.auth.admin()?.revision !== admin.revision)
        throw new AppError("INVALID_CREDENTIALS", "账号已更新，请重新登录");
      return admin;
    } finally {
      this.activeVerifications--;
    }
  }

  async login(ip: string, username: string, password: string) {
    const admin = await this.verify(ip, username, password);
    const secret = randomSecret();
    const session = {
      hash: secretHash(secret),
      csrfToken: randomSecret(),
      expiresAt: Date.now() + this.config.sessionTtlSeconds * 1000,
    };
    if (!this.storage.auth.createSession(session, admin.revision))
      throw new AppError("INVALID_CREDENTIALS", "账号已更新，请重新登录");
    return { secret, session };
  }

  async changePassword(ip: string, oldPassword: string, newPassword: string, session: Session) {
    const admin = await this.verify(ip, this.storage.auth.admin()?.username ?? "", oldPassword);
    const digest = await hashPassword(newPassword);
    if (
      !this.storage.auth.session(session.hash) ||
      !this.storage.auth.changePassword(digest, admin.revision)
    ) {
      throw new AppError("UNAUTHORIZED", "会话已失效，请重新登录");
    }
  }

  sessionInfo(identity: Identity | null) {
    const session = identity?.kind === "session" ? identity.session : undefined;
    const admin = this.storage.auth.admin();
    return {
      mode: this.config.mode,
      authenticated: !!session,
      initialized: !!admin,
      ...(session && admin
        ? { username: admin.username, csrfToken: session.csrfToken, expiresAt: session.expiresAt }
        : {}),
    };
  }
  session(hash: string) {
    return this.storage.auth.session(hash);
  }
  hasToken(hash: string) {
    return !!this.storage.auth.token(hash);
  }
  logout(session: Session) {
    this.storage.auth.deleteSession(session.hash);
  }
  pruneSessions() {
    this.storage.auth.pruneSessions();
  }
  tokens() {
    return this.storage.auth.tokens();
  }
  createToken(name: string, expiresAt?: number | null) {
    if (expiresAt != null && expiresAt <= Date.now())
      throw new AppError("VALIDATION_ERROR", "有效期必须晚于当前时间");
    const entry = { id: randomUUID(), name, createdAt: Date.now(), expiresAt: expiresAt ?? null };
    const token = `mansou_${randomSecret()}`;
    this.storage.auth.createToken(entry, secretHash(token));
    return { token, entry };
  }
  deleteToken(id: string) {
    if (!this.storage.auth.deleteToken(id)) throw new AppError("TOKEN_NOT_FOUND", "Token 不存在");
  }

  valid(identity: Identity) {
    if (identity.kind === "none") return this.config.mode === "none";
    if (identity.kind === "session") return !!this.storage.auth.session(identity.session.hash);
    return !!this.storage.auth.token(identity.hash);
  }
}
