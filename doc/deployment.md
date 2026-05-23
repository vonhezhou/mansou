# 部署说明

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
```

默认服务端口为 `3210`，数据目录挂载到 `./data`。

## 访问保护

公网或反向代理部署时应设置：

```bash
VENERA_ACCESS_TOKEN=change-me
```

设置后，除 `/`、`/assets/*`、`/health`、`/api/v1/health` 外，请求需携带：

```text
Authorization: Bearer change-me
```

## 反向代理

推荐启用 HTTPS，并把 `3210` 端口反代到内网服务。若使用访问 token，反向代理无需额外改写请求头。

## 数据和备份

数据目录包含 SQLite 数据库、源脚本、图片缓存和下载文件。可执行：

```bash
pnpm --filter @venera/server storage backup
```

旧 JSON 数据可导入：

```bash
pnpm --filter @venera/server storage import-json
```
