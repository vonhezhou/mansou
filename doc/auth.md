# 访问鉴权

## 模式与边界

`AUTH_MODE=none` 用于可信局域网；`AUTH_MODE=required` 用于公网或需要登录的部署。直接启动 Node.js 且不设置该变量时默认为 `none`；Docker 镜像和 Compose 默认 `required`。NAS 一旦通过公网入口开放，也按公网模式配置。

`required` 必须设置 `AUTH_ORIGIN`，例如 `https://venera.example.com`。值是浏览器看到的 origin，不能包含路径、末尾斜线或用户凭据。配置错误会阻止服务启动；尚未初始化管理员时，服务可启动，但业务 API 一律拒绝访问。

仅首页、前端静态资源、最小健康检查、登录和会话状态接口公开。健康检查只返回 `ok/name`，不包含数据路径或代理地址。此版本不提供注册、多用户、角色权限、JWT 或邮件找回。

## 首次创建管理员

Compose 服务启动后执行：

```bash
docker compose exec -it venera-web node dist/cli/admin.js init
```

本地源码运行：

```bash
pnpm --filter @venera/storage build
pnpm --filter @venera/server admin init
```

用户名默认 `admin`，允许 1–64 位字母、数字、下划线、点和连字符。密码为 12–128 字符，两次输入且不回显。命令必须在交互式终端运行，不接受密码参数；账号已存在时拒绝覆盖。

初始化命令与 Server 必须使用同一个 `VENERA_DATA_DIR`。源码下 server 命令默认使用 `apps/server/data`；容器默认使用 `/data`。Node.js 不自动加载 `.env`，源码启动时需要显式导出环境变量。

SQLite 只保存 Argon2id 密码哈希（随机盐，19 MiB 内存、2 次迭代、并行度 1）。账号、会话和 API Token 位于现有 `venera_web.sqlite`，不增加独立数据库服务。

## 浏览器登录

浏览器同源访问 `/api/v1`。登录成功后 Server 创建随机会话 ID，并通过 HttpOnly、SameSite=Lax、Path=/ 的 Cookie 返回；HTTPS origin 使用带 Secure 的 `__Host-venera_session`，HTTP 本地开发使用 `venera_session`。

会话 ID 明文不返回 JSON，不放入 localStorage 或资源 URL；SQLite 保存会话 ID 的 SHA-256 哈希。会话固定有效期默认 24 小时，可通过 `AUTH_SESSION_TTL_SECONDS` 设置为 60–2592000 秒，不自动续期。服务每分钟清理过期记录，过期记录即使未清理也无法使用。

登录请求必须携带匹配 `AUTH_ORIGIN` 的 Origin；登录后的写操作还需要 `X-CSRF-Token`，值从登录响应或会话状态接口读取。CSRF Token 只用于防跨站请求，不能独立用于登录。前端客户端自动处理。

登录及改密验证每个来源地址每分钟最多 5 次，全局每分钟最多 30 次，同时最多执行 2 个密码验证。成功尝试也计入额度。服务不信任任意 X-Forwarded-For，因此同一反向代理后的客户端共享地址限额。当前限流为单进程内存状态，重启后重置；大规模或多实例部署应在入口增加共享限流。

## 修改与重置密码

已登录管理员可在“账号设置”中验证旧密码并修改密码。所有浏览器会话随即失效。

忘记密码时，通过 SSH/本地终端执行：

```bash
docker compose exec -it venera-web node dist/cli/admin.js reset-password
# 源码运行：pnpm --filter @venera/server admin reset-password
```

重置会撤销所有浏览器会话；API Token 保持有效，需在登录后按需撤销。怀疑凭据泄露时，应同时检查并撤销相关 Token。

## 其他客户端的 API Token

管理员登录后在“账号设置”创建 Token，指定名称和有效期。界面提供 30 天、90 天、不过期；接口接受未来时间的 Unix 毫秒值，省略或 null 表示不过期。

Token 明文仅创建时显示一次，数据库只保存 SHA-256 哈希。其他客户端通过 `Authorization: Bearer <token>` 调用业务接口，无需 Cookie、Origin 或 CSRF Token。

Token 可以操作所有业务资源（包括源、下载、文件删除），但不能管理 Token、修改密码或退出浏览器会话。本版本没有细粒度 scope。每个客户端应使用独立 Token，便于单独撤销。

所有凭据只经 HTTPS 公网传输。不再支持 `?access_token=` 和 `x-venera-token`。

## SSE 与撤销

浏览器 EventSource、图片和文件下载沿用同源 Cookie；支持自定义请求头的其他客户端可用 Bearer。

SSE 首次连接验证凭据，推送前再次检查，每秒检查空闲连接的凭据。会话过期、退出、CLI 重置密码或 Token 撤销后，连接发送 `auth-expired` 事件并关闭；空闲连接通常在 1 秒内关闭，重连重新鉴权。已完成的文件传输不可能被追回，普通请求在入口验证凭据。

## 从旧共享 Token 迁移

1. 更新前备份数据目录。
2. 移除 `VENERA_ACCESS_TOKEN`；只要该旧变量仍非空，服务就拒绝启动并提示迁移。
3. 公网明确设置 `AUTH_MODE=required` 和真实 `AUTH_ORIGIN`；局域网按需明确设置 `none`。
4. 使用同一持久化目录执行 `admin init`，再通过浏览器登录。
5. 为外部客户端创建独立 Token，更新请求头；删除旧 URL Token 和自定义头。前端会清除旧 localStorage 条目。

`AUTH_MODE=none` 不是迁移公网部署的替代方式。反向代理及访问日志应避免记录 Cookie、Authorization、请求体；应用默认请求日志不记录 query 或认证头。备份也包含密码哈希、会话记录和 Token 哈希，须限制读取权限。
