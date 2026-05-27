# API 与客户端生成

本文档记录 `apps/server` 当前 HTTP API 契约、OpenAPI 导出方式和客户端生成建议。

## OpenAPI

OpenAPI 文档地址：

```text
GET /api/v1/openapi.json
```

导出到文件：

```bash
pnpm --filter @venera/server openapi openapi.json
```

该命令会从 `apps/server/src/routes/openapi.ts` 导出当前手写维护的 OpenAPI 文档。修改路由后应同步更新该文件，并至少运行：

```bash
pnpm --filter @venera/server test
pnpm --filter @venera/server typecheck
```

如果改动涉及 `@venera/storage` 的源码，server 测试前应先构建 storage，确保 workspace package 导出同步：

```bash
pnpm --filter @venera/storage build
pnpm --filter @venera/server test
```

生成 TypeScript 客户端示例：

```bash
npx openapi-typescript openapi.json -o api-types.ts
npx @hey-api/openapi-ts -i openapi.json -o generated-client
```

如果启用了 `VENERA_ACCESS_TOKEN`，普通 API 使用：

```text
Authorization: Bearer <token>
```

图片和 SSE 这类浏览器无法设置自定义请求头的场景，也支持：

```text
?access_token=<token>
```

## 错误格式

API 错误统一返回：

```json
{
  "error": {
    "code": "DOWNLOAD_NOT_FOUND",
    "message": "Download task not found",
    "requestId": "req-1"
  }
}
```

常见错误码：

- `VALIDATION_ERROR`：请求参数或请求体校验失败。
- `DOWNLOAD_NOT_FOUND`：下载任务不存在。
- `SOURCE_NOT_LOADED`：源未加载或不存在。
- `PLUGIN_TIMEOUT`：插件调用超时。
- `PLUGIN_NETWORK_ERROR`：插件网络请求失败。
- `IMAGE_REJECTED`：图片加载被拒绝或协议不支持。
- `INTERNAL_ERROR`：未分类服务端错误。

前端或外部客户端应优先根据 `error.code` 判断错误类型，`message` 仅用于展示或调试。

## 下载 API

创建下载任务：

```text
POST /api/v1/downloads
```

请求体：

```json
{
  "sourceKey": "mock",
  "comicId": "mock-comic-1",
  "episodeId": "chapter-1",
  "all": false
}
```

服务端会对相同 `sourceKey + comicId + episodeId/all` 的 `queued`、`running`、`paused`、`completed` 任务去重，避免重复排队。

下载任务状态：

- `queued`：等待执行。
- `running`：正在执行。
- `paused`：用户暂停，可继续。
- `completed`：完成。
- `failed`：失败，可重试失败图片或重新运行任务。
- `cancelled`：已取消。

下载任务关键字段：

- `error`：失败信息。
- `errorCode`：结构化失败码，例如 `HTTP_403`、`TIMEOUT`、`IMAGE_TOO_LARGE`、`DOWNLOAD_ERROR`。
- `recovered`：服务重启后从 `queued/running` 恢复为 `queued` 的任务会标记为 `true`。
- `logs`：最近的任务阶段日志，最多保留 100 条。

任务操作：

```text
POST /api/v1/downloads/{taskId}/pause
POST /api/v1/downloads/{taskId}/resume
POST /api/v1/downloads/{taskId}/cancel
POST /api/v1/downloads/{taskId}/rerun
POST /api/v1/downloads/{taskId}/cbz
DELETE /api/v1/downloads/{taskId}?files=true
```

失败图片：

```text
GET /api/v1/downloads/{taskId}/items
POST /api/v1/downloads/{taskId}/items/retry
POST /api/v1/downloads/{taskId}/items/retry-failed
```

单图重试请求体：

```json
{
  "imageKey": "mock://image/mock-comic-1/chapter-1/3"
}
```

批量重试失败图片响应示例：

```json
{
  "task": { "id": "task-id", "status": "failed" },
  "retried": 1,
  "results": [
    {
      "imageKey": "mock://image/mock-comic-1/chapter-1/3",
      "ok": true
    }
  ]
}
```

已下载图片会校验文件是否仍存在。若数据库中图片项为 `completed` 但文件丢失，后续下载或重试不会跳过该图片，会重新补齐。

## 下载事件 SSE

订阅下载状态：

```text
GET /api/v1/downloads/events
```

事件格式：

```text
event: downloads
data: [{"id":"task-id","status":"running"}]
```

行为约定：

- 首次连接会立即发送当前任务列表。
- 下载任务状态变化时由 `DownloadService` 主动推送。
- 服务端保留 heartbeat：`: heartbeat`，当前间隔为 30 秒。
- 如果启用了 `VENERA_ACCESS_TOKEN`，浏览器 `EventSource` 应使用 `?access_token=<token>`。

## 历史记录

保存阅读历史：

```text
PUT /api/v1/library/history/{sourceKey}/{comicId}
```

请求体：

```json
{
  "title": "Comic Title",
  "cover": "cover-key",
  "episodeId": "chapter-1",
  "page": 2,
  "progress": 0.4
}
```

`title` 和 `cover` 会持久化到 SQLite。后续保存历史时如果未传 `title` 或 `cover`，会保留已有值。
