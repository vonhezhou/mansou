import { hash, verify, Algorithm } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";

export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("密码长度必须为 12 至 128 个字符");
}
export async function hashPassword(password: string) {
  validatePassword(password);
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}
export const verifyPassword = (digest: string, password: string) => verify(digest, password);
export const randomSecret = () => randomBytes(32).toString("base64url");
export const secretHash = (secret: string) => createHash("sha256").update(secret).digest("hex");
