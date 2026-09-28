import { createStorage } from "@venera/storage";
import path from "node:path";
import { hashPassword } from "../auth/password.js";

// Raw TTY input prevents passwords from appearing in terminal echo or shell history.
async function prompt(label: string, secret = false): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("请使用交互式终端（Docker 使用 -it），不接受命令行密码参数");
  process.stdout.write(label);
  const previousRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003" || char === "\u0004") return finish(new Error("已取消"));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") {
          if (value && !secret) process.stdout.write("\b \b");
          value = [...value].slice(0, -1).join("");
        } else if (char >= " " && value.length < 128) {
          value += char;
          if (!secret) process.stdout.write(char);
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const command = process.argv[2];
  if (!["init", "reset-password"].includes(command) || process.argv.length !== 3) {
    throw new Error("用法：admin init | admin reset-password（不要传入密码参数）");
  }
  const storage = createStorage(process.env.VENERA_DATA_DIR ?? path.join(process.cwd(), "data"));
  try {
    const admin = storage.auth.admin();
    if (command === "init" && admin) throw new Error("管理员已存在，初始化不会覆盖账号");
    if (command === "reset-password" && !admin) throw new Error("请先执行 admin init");
    const username =
      admin?.username ?? ((await prompt("管理员用户名 [admin]：")).trim() || "admin");
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username))
      throw new Error("用户名只允许 1–64 位字母、数字、下划线、点或连字符");
    const password = await prompt("密码（12–128 字符，不回显）：", true);
    if (password !== (await prompt("再次输入密码：", true))) throw new Error("两次密码不一致");
    const digest = await hashPassword(password);
    if (admin) {
      if (!storage.auth.changePassword(digest, admin.revision))
        throw new Error("账号已被其他操作修改，请重试");
    } else storage.auth.createAdmin(username, digest);
    console.log(
      admin
        ? "密码已重置，所有登录会话已撤销。API Token 保持有效，请按需单独撤销。"
        : "管理员已创建。",
    );
  } finally {
    storage.close();
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
