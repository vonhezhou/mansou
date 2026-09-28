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

协议唯一源文件是 `packages/contracts/openapi.yaml`。先修改 YAML，再生成类型和运行时文档：

```bash
pnpm --filter @venera/contracts generate
pnpm --filter @venera/contracts build
pnpm --filter @venera/contracts generate:check
```

`src/api.generated.ts` 和 `src/openapi.generated.ts` 是生成文件，请勿手改。生成结果纳入 Git，CI 检查是否与 YAML 一致。Server 文档端点从生成产物返回 JSON；鉴权开启时该端点也需要凭据。

鉴权接口使用 YAML schema 做运行时请求校验和响应序列化，前端鉴权类型直接来自生成产物。已有业务路由仍保留原有 Zod 校验和请求封装；本次不把所有业务路由重写为生成客户端。

## 鉴权接口

- `GET /api/v1/auth/session`：公开，返回 mode、initialized、authenticated；已登录浏览器另返回 username、csrfToken、expiresAt。
- `POST /api/v1/auth/login`：公开，接受 username/password，要求 Origin 匹配 AUTH_ORIGIN，成功设置 Cookie。
- `POST /api/v1/auth/logout`：撤销当前浏览器会话。
- `PUT /api/v1/auth/password`：接受 oldPassword/newPassword，成功撤销所有会话。
- `GET /api/v1/auth/tokens`：列出 Token 元数据，不含明文或哈希。
- `POST /api/v1/auth/tokens`：接受 name 和可选 expiresAt（Unix 毫秒；null 表示不过期），返回一次性 token 和 entry。
- `DELETE /api/v1/auth/tokens/{id}`：撤销指定 Token。

退出、改密、Token 管理仅允许管理员 Session；写操作要求匹配的 Origin 和 X-CSRF-Token。外部客户端通过 `Authorization: Bearer <token>` 访问业务接口，不能操作这些账号接口。

浏览器图片、文件、SSE 使用同源 Cookie，不再接受 URL 中的 access_token 或 x-venera-token。公开 API 响应禁止缓存；开启鉴权但未初始化管理员时不允许业务访问。配置、初始化、限流、过期和迁移见 [鉴权说明](auth.md)。

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
- `UNAUTHORIZED` / `INVALID_CREDENTIALS`：401，凭据缺失、失效或登录失败。
- `CSRF_REJECTED` / `SESSION_REQUIRED`：403，跨站请求校验失败或需要浏览器会话。
- `AUTH_RATE_LIMITED`：429，登录或密码验证过于频繁。
- `AUTH_DISABLED` / `TOKEN_NOT_FOUND`：404，鉴权功能未启用或 Token 不存在。
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
- 浏览器 EventSource 使用同源 Cookie；其他客户端可携带 Bearer Token。
- 凭据失效时发送 `event: auth-expired`、`data: {}` 后关闭连接；空闲连接每秒检查一次，重连重新鉴权。
