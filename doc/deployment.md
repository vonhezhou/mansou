# 部署说明

需要 Docker Engine 和 Docker Compose v2。以下命令在克隆后的仓库根目录执行；当前通过源码构建镜像。完整环境变量说明见 [配置参考](configuration.md)。

## VPS 公网部署

```bash
cp .env.example .env
```

修改 `.env`：

```dotenv
AUTH_MODE=required
AUTH_ORIGIN=https://mansou.example.com
MANSOU_BIND=127.0.0.1
```

将域名替换为实际访问地址，然后启动并初始化管理员：

```bash
docker compose up -d --build
docker compose exec -it mansou node dist/cli/admin.js init
```

Compose 默认只将 `3210` 绑定到 VPS 的回环地址，供同机 HTTPS 反向代理访问。Docker 镜像与 Compose 默认开启鉴权；没有正确的 AUTH_ORIGIN 会启动失败，没有管理员则业务接口拒绝访问。不要为解决配置错误而在公网关闭鉴权。

以 Caddy 为例，同机入口可配置：

```caddyfile
mansou.example.com {
    reverse_proxy 127.0.0.1:3210
}
```

若入口使用 Nginx，API/SSE location 应关闭 `proxy_buffering`，并将 `proxy_read_timeout` 设置为大于 30 秒（例如 120 秒）。保留 Origin、Cookie 和 Authorization；不要改写浏览器 Origin。应用通过 AUTH_ORIGIN 决定 Cookie Secure 属性，不依赖客户端可伪造的 X-Forwarded-Proto。

反向代理运行在另一个容器时，可以通过 Compose 网络连接服务，不必发布业务端口；相应调整代理目标为服务名。

## NAS 可信局域网部署

`.env` 设置：

```dotenv
AUTH_MODE=none
AUTH_ORIGIN=
MANSOU_BIND=0.0.0.0
```

执行 `docker compose up -d --build`，访问 `http://NAS局域网地址:3210`，无需初始化管理员。此模式信任所有能够访问服务的人；路由器不要将该端口映射到公网。若需要登录，改为 required 并配置实际 origin；公网必须使用 HTTPS。

## 前后端独立部署

`apps/web/dist` 可由 NAS 静态站点服务托管。浏览器始终调用同源 `/api/v1`，由 NAS 的反向代理将 `/api/` 转发给 VPS。`AUTH_ORIGIN` 配置为浏览器打开的 NAS 站点 origin。

其他客户端直接调用 VPS HTTPS API 并使用独立 Bearer Token。当前浏览器客户端不提供跨站 Cookie/CORS 登录模式；若还需另一个浏览器入口，应先设计明确的 origin 白名单，不能直接放开任意来源。

下载任务由 Server 执行，文件保存到 Server 的数据目录；Server 在 VPS 时，文件也在 VPS。浏览器导出文件与自动同步到 NAS 是不同功能。

## 本地开发

```bash
pnpm install
pnpm build
pnpm dev
```

浏览器访问 `http://localhost:5173`，Vite 将 `/api` 代理到 `3210`。未设置 AUTH_MODE 时源码运行默认 none。验证登录时，在终端导出：

```bash
export AUTH_MODE=required
export AUTH_ORIGIN=http://localhost:5173
pnpm --filter @mansou/server admin init
pnpm dev
```

Node.js 不会自动读取 `.env`；Compose 会读取它用于变量替换。HTTP 仅用于本地/可信网络开发，公网使用 HTTPS。

## 日志与升级

```bash
docker compose ps
docker compose logs --tail=100 mansou
```

升级前先按下节备份数据目录，再获取代码并重新构建：

```bash
git pull --ff-only
docker compose up -d --build
```

升级后核对容器状态，并在服务器本机访问 `http://127.0.0.1:3210/api/v1/health`，预期返回 `{"ok":true,"name":"mansou"}`。健康检查仅说明服务可达，仍需通过浏览器验证登录、搜索与下载等业务操作。若修改了 Compose 端口绑定，按实际地址检查。

当前使用 `MANSOU_*` 环境变量、`mansou.sqlite` 和新的会话标识，不自动迁移更名前的 `VENERA_*` 配置、`venera_web.sqlite` 或旧会话。早期测试环境可备份后使用独立空目录重新初始化；不要直接删除唯一的数据副本。

## 数据与备份

容器 `/data` 挂载到宿主机 `./data`，包含 SQLite、管理员/会话/Token 哈希、源脚本、图片缓存和下载文件。升级容器时保留此挂载。备份与恢复应包含整个数据目录，并限制目录和备份的访问权限。

数据库版本 6 会在首次打开时自动创建下载图片的 `(task_id, id)` 排序索引，保留原记录和鉴权数据，无需手动迁移命令。大数据库升级时，建索引会增加一次启动耗时和额外磁盘占用；后续启动复用已创建的索引。

推荐停服后备份整个目录，在仓库外指定备份位置。例如：

```bash
docker compose stop mansou
tar -czf ../mansou-data-backup.tar.gz data
```

确认备份成功后再运行 `docker compose start mansou`。示例文件名固定，重复备份时请更换文件名，避免覆盖上一份备份。

恢复时先停止服务，将备份解压到单独目录检查，再用其中的完整 `data/` 替换宿主机挂载目录，保留原目录直到恢复验证成功。不要把备份直接合并到仍在运行的目录；数据库、WAL/SHM、插件和下载文件应来自同一份备份。恢复后启动服务并验证账号、源与下载文件。

源码存储命令也可用于数据库文件备份及旧 JSON 导入：

```bash
pnpm --filter @mansou/server storage backup
pnpm --filter @mansou/server storage import-json
```

`storage backup` 直接复制 `mansou.sqlite`，不执行在线 SQLite 快照，也不包含插件、缓存和下载文件。因此只应在服务已正常停止、数据库连接关闭后使用；不能将其视为运行中数据库的完整一致性备份。`storage restore <备份文件路径>` 同样需要先停止服务，使用与服务一致的 `MANSOU_DATA_DIR`，且不要留下来自另一份数据库的 WAL/SHM 文件。

管理员密码恢复见 [鉴权说明](auth.md)。

## NUC 小说分支测试部署

2026-10-31 经用户授权，已将 `codex/novel-search` 在 NUC 测试环境部署；当前应用提交为 `6283f23`，镜像为 `mansou:novel-6283f23`。小说搜索使用 `/#novels`，独立小说源管理使用 `/#novel-sources`，漫画与小说统一下载任务使用 `/#downloads`。访问 `http://192.168.30.147:3210`；沿用该可信局域网测试环境原有的免登录配置。

当前发布目录为 `/home/von/codes/venera/mansou-novel/current`，保留原 `/home/von/codes/venera/venera_web/.env` 和 `data/`。统一操作入口：

```sh
ssh nuc /home/von/codes/venera/mansou-novel/compose.sh ps
ssh nuc /home/von/codes/venera/mansou-novel/compose.sh logs --tail=100 mansou
```

不要在旧源码目录直接执行重新构建，以免把当前测试镜像切回旧版本。原镜像和升级前完整备份保留在 NUC，具体位置见[首次部署记录](verification/2026-10-31-nuc-deployment.json)和[当前发布记录](verification/2026-10-31-nuc-deployment-6283f23.json)。升级检查比较持久化源、启停及任务身份，并核对真实启用源加载；运行时临时测试源不作为持久化数据保留的依据。

五个小说基线源来自用户提供的私有 JSON，通过 API 导入，未内置到镜像。新笔趣阁已实测搜索和两章 TXT 导出；其他源的网络、规则与完整目录限制见[验收说明](novel-acceptance.md)。
