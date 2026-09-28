import type { StorageDatabase, Session } from "@venera/storage";
import { ApiError } from "../routes/errors.js";
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
    readonly storage: StorageDatabase,
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
        throw new ApiError(429, "AUTH_RATE_LIMITED", "尝试过于频繁，请一分钟后重试");
      this.attempts.set(key, value);
    }
    if (this.activeVerifications >= 2) throw new ApiError(429, "AUTH_RATE_LIMITED", "请稍后重试");
  }

  async verify(ip: string, username: string, password: string) {
    this.limit(ip);
    const admin = this.storage.auth.admin();
    if (!admin)
      throw new ApiError(401, "INVALID_CREDENTIALS", "用户名或密码不正确，或管理员尚未初始化");
    this.activeVerifications++;
    try {
      const matches = await verifyPassword(admin.passwordHash, password);
      if (!matches || username !== admin.username)
        throw new ApiError(401, "INVALID_CREDENTIALS", "用户名或密码不正确");
      if (this.storage.auth.admin()?.revision !== admin.revision)
        throw new ApiError(401, "INVALID_CREDENTIALS", "账号已更新，请重新登录");
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
      throw new ApiError(401, "INVALID_CREDENTIALS", "账号已更新，请重新登录");
    return { secret, session };
  }

  async changePassword(ip: string, oldPassword: string, newPassword: string, session: Session) {
    const admin = await this.verify(ip, this.storage.auth.admin()?.username ?? "", oldPassword);
    const digest = await hashPassword(newPassword);
    if (
      !this.storage.auth.session(session.hash) ||
      !this.storage.auth.changePassword(digest, admin.revision)
    ) {
      throw new ApiError(401, "UNAUTHORIZED", "会话已失效，请重新登录");
    }
  }

  valid(identity: Identity) {
    if (identity.kind === "none") return this.config.mode === "none";
    if (identity.kind === "session") return !!this.storage.auth.session(identity.session.hash);
    return !!this.storage.auth.token(identity.hash);
  }
}
