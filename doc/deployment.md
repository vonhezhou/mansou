# 部署说明

## VPS 公网部署

```bash
cp .env.example .env
```

修改 `.env`：

```dotenv
AUTH_MODE=required
AUTH_ORIGIN=https://venera.example.com
VENERA_BIND=127.0.0.1
```

将域名替换为实际访问地址，然后启动并初始化管理员：

```bash
docker compose up -d --build
docker compose exec -it venera-web node dist/cli/admin.js init
```

Compose 默认只将 `3210` 绑定到 VPS 的回环地址，供同机 HTTPS 反向代理访问。Docker 镜像与 Compose 默认开启鉴权；没有正确的 AUTH_ORIGIN 会启动失败，没有管理员则业务接口拒绝访问。不要为解决配置错误而在公网关闭鉴权。

以 Caddy 为例，同机入口可配置：

```caddyfile
venera.example.com {
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
VENERA_BIND=0.0.0.0
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
pnpm --filter @venera/server admin init
pnpm dev
```

Node.js 不会自动读取 `.env`；Compose 会读取它用于变量替换。HTTP 仅用于本地/可信网络开发，公网使用 HTTPS。

## 数据与备份

容器 `/data` 挂载到宿主机 `./data`，包含 SQLite、管理员/会话/Token 哈希、源脚本、图片缓存和下载文件。升级容器时保留此挂载。备份与恢复应包含整个数据目录，并限制目录和备份的访问权限。

数据库版本 6 会在首次打开时自动创建下载图片的 `(task_id, id)` 排序索引，保留原记录和鉴权数据，无需手动迁移命令。大数据库升级时，建索引会增加一次启动耗时和额外磁盘占用；后续启动复用已创建的索引。

已有存储命令可用于备份及旧 JSON 导入：

```bash
pnpm --filter @venera/server storage backup
pnpm --filter @venera/server storage import-json
```

管理员恢复与旧共享 Token 的升级步骤见 [鉴权说明](auth.md)。
