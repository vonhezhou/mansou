# apps/web 前端架构

## 定位与结构

React/Vite 客户端提供源管理、搜索、详情和章节预览、历史、下载管理，以及可选的管理员登录。章节图片用于预览，本次不扩展阅读器能力。

- `src/main.tsx`：挂载 App 和加载样式。
- `src/App.tsx`：AuthGate 包裹业务 Workspace，协调页面状态与 SSE。
- `src/app/AppShell.tsx`：页面布局和 hash tab 导航。
- `src/features/*`：搜索、源、下载、历史及鉴权界面。
- `src/hooks/*`：各业务功能状态与异步操作。
- `src/api/client.ts`：同源 HTTP 请求、CSRF 请求头和结构化错误。
- `src/api/auth.ts`：鉴权 API，类型来自 OpenAPI YAML 生成产物。
- `src/api/venera.ts`：业务请求封装与资源 URL。
- `src/types.ts`：尚未迁移到生成契约的业务类型及 UI 类型。
- `src/styles/*`：基础、布局、组件和页面样式。

当前使用 hash tab，无额外路由库或全局状态库。新增页面先沿现有功能边界拆分，不将业务逻辑堆回 App。

## 登录与会话

AuthGate 先请求 `/auth/session`。none 模式直接挂载业务 Workspace；required 模式只有登录成功后才挂载，避免未登录时启动业务请求和 SSE。

Cookie 由服务端设置，浏览器 JavaScript 不读取会话 ID。CSRF Token 存在内存中，每次启动从会话接口取得；HTTP client 为写操作自动附加它。不要将 Session 或 API Token 保存到 localStorage，也不要拼到 URL。

业务请求返回 401 时通知 AuthGate 重新检查登录状态；SSE 的 auth-expired 事件同样触发该流程。Workspace 卸载时关闭 EventSource。网络断开时通过会话检查和 EventSource 原生重连恢复，不把所有网络错误当作密码错误。

账号设置提供改密和退出；TokenPanel 创建、查看元数据和撤销外部客户端 Token。新 Token 仅保存在当前组件内存并展示一次，关闭或卸载后不再显示。

## API 与部署边界

所有 API 方法通过 client 封装。路径参数使用 encodeURIComponent，查询参数使用 URLSearchParams。图片、CBZ 和 SSE 使用同源资源 URL，Cookie 自动随请求发送。

浏览器固定使用 `/api/v1`。开发由 Vite 代理，独立部署由站点入口反向代理至 Server；当前不支持浏览器直接跨站 Cookie 登录。

协议源是 `packages/contracts/openapi.yaml`，生成文件禁止手改。现阶段鉴权接口使用生成类型和服务端 schema；已有业务接口保留原有类型与封装，后续按功能迁移。

## 功能边界

- 源设置和 Cookie 导入归属当前选择的源，避免与可安装源列表混用。
- 下载明细按需加载；批量失败重试调用服务端批量接口。
- 会导致数据丢失或客户端断连的操作应清晰提示后果，例如删除文件和撤销 Token。
- 历史页沿用既有行为；新增功能仍围绕搜索、聚合搜索、下载和 NAS/VPS 部署需求。

## 验证

```bash
pnpm --filter @venera/contracts generate:check
pnpm --filter @venera/web test
pnpm --filter @venera/web typecheck
pnpm --filter @venera/web build
```

鉴权回归还需运行 server 测试，覆盖匿名/登录两种模式、CSRF、密码限流与重置、Token 权限、SSE 失效和真实 HTTP 连接。浏览器验证登录、账号设置、退出，以及 401 后返回登录页。
