# apps/web 前端架构说明

本文档记录 `apps/web` 当前前端结构和后续迭代约定。目标是让后续改动优先沿现有边界扩展，避免重新把业务逻辑堆回单个组件。

## 当前定位

`apps/web` 是 `apps/server` 的产品化 Web 客户端，负责漫画源管理、搜索、详情、阅读、历史、下载和基础服务状态展示。

当前仍是轻量 React/Vite 应用，未引入路由库和全局状态库。新增复杂能力前，应优先确认现有 hash tab、组件状态和 API client 是否足够。

## 目录职责

- `src/main.tsx`：React 挂载入口，只负责渲染 `App` 和加载全局样式。
- `src/App.tsx`：当前主应用组件，包含页面状态、tab 分区和主要交互。后续功能继续增多时，应从这里拆出页面组件。
- `src/types.ts`：Web 侧使用的接口类型和 UI 类型。
- `src/api/client.ts`：底层 HTTP client，负责 API base、access token、请求头、错误解析和带 token 的资源 URL。
- `src/api/venera.ts`：业务 API 封装，组件层不应直接拼 `/api/v1` 路径。
- `src/api/*.test.ts`：API client 和 URL helper 的单元测试。
- `src/styles.css`：当前全局样式。若样式继续膨胀，再按组件拆分 CSS。
- `vite.config.ts`：Vite 构建和开发代理配置。
- `vitest.config.ts`：Vitest 测试环境配置。

## API 访问约定

所有 server 接口调用应优先经过 `src/api/venera.ts`。

新增接口时遵循：

- 在 `src/types.ts` 增加必要类型。
- 在 `src/api/venera.ts` 增加业务方法。
- 路径参数必须使用 `encodeURIComponent`。
- 查询参数优先使用 `URLSearchParams`。
- 图片、SSE 等不能设置 header 的资源请求必须通过 `withAccessToken` 追加 `access_token`。
- 组件层不要直接引用 `apiBase` 或手写 `/api/v1`。

错误处理由 `src/api/client.ts` 统一解析 server 返回的 `{ error: { message } }`。后续如果要展示 `code/details/requestId`，应先扩展 client 的错误类型，而不是在组件里重复解析。

## 页面结构

当前使用 hash tab 做轻量页面分区：

- `#search`：搜索、详情和阅读器。
- `#history`：阅读历史和恢复阅读。
- `#downloads`：下载任务、下载明细、失败过滤和任务操作。
- `#sources`：源安装、启用/禁用、源设置、Cookie 导入/清空。

暂不使用 React Router。只有当需要深链到具体漫画、章节、下载任务或设置页时，再评估引入路由库。

## 状态管理约定

当前状态集中在 `App.tsx`，适合现阶段规模。后续拆分优先级：

1. 先按页面拆组件，例如 `SearchView`、`ReaderView`、`DownloadsView`、`SourcesView`、`HistoryView`。
2. 再把页面内部纯 UI 拆成小组件，例如 `DownloadTaskCard`、`SourceCard`、`ComicCard`。
3. 最后才考虑全局状态库。除非出现跨页面复杂同步，否则不要提前引入。

当前 `busy` 是全局 pending 状态。后续体验优化应逐步拆成局部 pending，例如搜索、源管理、下载操作分别维护状态。

## 阅读器约定

当前阅读器仍是长图列表模式，历史恢复依赖图片页锚点：`page-{index}`。

后续阅读器增强建议顺序：

- 用 IntersectionObserver 或滚动计算保存当前页。
- 节流调用 `saveHistory`，避免滚动时频繁请求。
- 增加上一章/下一章、返回详情和当前页指示。
- 单张图片加载失败时提供重试，不要让整个阅读器失败。

## 下载管理约定

下载任务当前按状态分组：进行中、失败、完成、其他。

后续新增下载能力时：

- 单任务操作继续放在任务卡片内。
- 危险操作必须确认，例如删除任务、删除文件。
- 下载明细默认按需加载，避免进入页面时拉取所有任务明细。
- 如果要批量重试失败图片，优先等 server 提供批量接口；不要在前端循环大量单图请求作为长期方案。

## 源管理约定

源管理当前保留 JSON 设置编辑。后续设置表单化时：

- 保留 JSON 高级编辑作为兜底。
- 优先支持基础类型：string、number、boolean、enum。
- 不确定 schema 结构时不要猜测，应先补齐 server 契约或文档。
- Cookie 操作属于敏感操作，清空前必须确认。

## 测试约定

当前测试重点覆盖 API client 和 URL helper。

运行命令：

```bash
pnpm --filter @venera/web test
pnpm --filter @venera/web typecheck
pnpm --filter @venera/web build
```

新增测试优先级：

- API client：错误解析、token header、path encoding、资源 URL token。
- 纯函数：搜索分页、下载分组、阅读进度计算。
- 组件测试：只有当组件拆分后再引入，避免在当前 `App.tsx` 巨组件上写脆弱测试。

`vitest.config.ts` 使用 `jsdom` 环境。当前测试内显式 mock `localStorage`，避免 Node/Vitest/jsdom 组合差异影响测试稳定性。

## 后续演进建议

近期优先级：

1. 从 `App.tsx` 拆出页面组件。
2. 为搜索分页、下载分组、阅读进度计算补纯函数测试。
3. 增加真实阅读进度保存。
4. 表单化源设置。
5. 评估深链需求，再决定是否引入 React Router。

每个阶段继续保持小提交，并在提交前至少运行 `test`、`typecheck`、`build`。
