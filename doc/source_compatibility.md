# 真实源兼容矩阵

本文件用于记录阶段 3 后续真实源验证结果。每个源至少记录搜索、详情、章节、图片四条主路径，以及 Cookie、代理、人机验证等限制。

| 源         | 搜索 | 详情    | 章节    | 图片    | 条件/限制                                                                      | 缺失 API                                |
| ---------- | ---- | ------- | ------- | ------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| mock       | pass | pass    | pass    | pass    | 离线 fixture                                                                   | 无                                      |
| baozi      | pass | pass    | pass    | pass    | 安装/初始化时会刷新源域名，本次耗时约 108s；后续网络状态可能影响初始化         | 无                                      |
| Komiic     | pass | pass    | pass    | pass    | 图片接口需要 `comic.onImageLoad` 返回的 referer/user-agent；已在运行时兼容     | 无                                      |
| comick     | pass | pass    | pass    | fail    | 图片 CDN 返回 403；需要继续确认 headers、referer、Cookie 或 Cloudflare 限制    | 待确认图片加载策略                      |
| manga_dex  | fail | pending | pending | pending | 搜索阶段失败：`ReferenceError: APP is not defined`                             | `APP` 全局兼容层                        |
| ykmh       | pass | pass    | pass    | fail    | 漫画/章节 ID 是完整 URL，需使用 query 形式接口；图片 URL 本次返回 404          | 待确认图片加载策略或源侧图片 URL 有效性 |
| copy_manga | fail | pending | pending | pending | 安装后 `init` 触发后台网络刷新，`ECONNRESET` 以未捕获 Promise 形式导致进程退出 | 插件异步任务错误隔离/生命周期保护       |

## 验证建议

1. 安装源后调用 `GET /api/v1/debug/:sourceKey/search?keyword=test`。
2. 选取一个搜索结果，调用 `GET /api/v1/debug/:sourceKey/comics/:comicId`。
3. 选取章节，调用 `GET /api/v1/debug/:sourceKey/comics/:comicId/episodes/:episodeId/pages`。
4. 选取图片，调用 `GET /api/v1/debug/:sourceKey/image?imageKey=...&comicId=...&episodeId=...`。
5. 将失败原因归类为网络、Cookie/登录、人机验证、缺失运行时 API、源脚本异常。

## 2026-05-23 验证记录

本轮使用独立 `VENERA_DATA_DIR` 逐源安装验证，避免源脚本初始化副作用污染主数据目录。验证关键词为 `one`，主路径为安装、搜索、详情、章节、首图调试加载。

- `baozi`：搜索返回 81 条；详情和第 1 话章节页通过；首图返回 `image/jpeg`，27143 bytes。
- `Komiic`：搜索返回 30 条；详情和章节页通过；补齐 `comic.onImageLoad` 兼容后首图返回 `image/jpeg`，108418 bytes。
- `comick`：搜索返回 50 条；补齐分组章节扁平化后详情和章节页通过；首图请求返回 403。
- `manga_dex`：安装通过；搜索失败，错误为 `ReferenceError: APP is not defined`。
- `ykmh`：搜索、详情、章节页通过；补充 query 形式详情/章节接口以支持 URL 型 ID；首图请求返回 404。
- `copy_manga`：安装接口返回 200，但源初始化后后台请求 `refreshSearchApi` 出现 `ECONNRESET` 未捕获异常，进程退出。

## 2026-05-25 Worker 模式验证记录

本轮使用独立临时 `VENERA_DATA_DIR`，设置 `VENERA_PLUGIN_ISOLATION=worker`，通过服务端 API 安装并验证真实源主路径。验证关键词为 `one`，主路径为安装、搜索、详情、章节、首图调试加载。

| 源        | 安装 | 搜索 | 详情    | 章节    | 图片    | 备注                                                                          |
| --------- | ---- | ---- | ------- | ------- | ------- | ----------------------------------------------------------------------------- |
| baozi     | pass | pass | pass    | fail    | pending | 章节页 API 返回 500；需后续单独确认源脚本章节逻辑或 Worker 运行时 API 差异。  |
| Komiic    | pass | pass | pass    | pass    | pass    | Worker 模式下 `comic.onImageLoad` 可通过图片代理调用，首图加载通过。          |
| comick    | pass | pass | pass    | fail    | pending | 本轮章节页返回空图片列表，未进入图片验证；需使用固定 comic/episode 样本复测。 |
| manga_dex | pass | fail | pending | pending | pending | 搜索 API 返回 500；仍需补齐 `APP` 等全局兼容层。                              |
| ykmh      | pass | pass | pass    | pass    | fail    | 首图请求返回 404；与 VM 模式历史结果一致，倾向源侧图片 URL 或加载策略问题。   |

本轮同时确认 Worker 隔离模式下已支持以下能力：

- Worker 内复用 `createRuntimeApi`。
- Worker 内使用同一 `VENERA_DATA_DIR` 下的 sqlite storage adapter 支持 Cookie/Data 存储。
- 图片代理可通过 Worker 调用 `comic.getImageLoadingConfig`、`comic.onImageLoad`、`source.getImageLoadingConfig` 和 `getThumbnailLoadingConfig`。
- mock 源在 `VENERA_PLUGIN_ISOLATION=worker` 下的搜索、详情、章节、图片、下载 API 集成测试通过。

## 2026-05-25 Worker 模式补充验证

本轮补齐 `APP` 全局别名、Worker 详情章节扁平化和 `baozi` 章节 fallback 后，使用 `pnpm --filter @venera/server compat` 重新验证重点源。

| 源        | 安装 | 搜索 | 详情 | 章节 | 图片 | 备注                                                                         |
| --------- | ---- | ---- | ---- | ---- | ---- | ---------------------------------------------------------------------------- |
| baozi     | pass | pass | pass | pass | pass | Worker 模式下章节页 500 已修复；章节 fallback 可返回真实图片并通过首图加载。 |
| manga_dex | pass | pass | pass | pass | pass | `APP` 兼容层生效；Worker 详情章节已扁平化，章节和首图加载通过。              |

兼容验证 CLI 用法：

```bash
VENERA_DATA_DIR=/tmp/venera-compat pnpm --filter @venera/server compat manga_dex,baozi --keyword=one
```

CLI 默认输出 JSON；使用 `--output=result.md --format=markdown` 可输出 Markdown 表格。

## Server Runtime 兼容层现状

截至 2026-05-25，server 侧已补齐以下最小兼容能力，覆盖 `manga_dex` 等真实源验证中暴露的问题，并由 server 测试防回归。

### 全局 API / 别名

插件在 Worker 内提供以下兼容别名：

| API                                 | 兼容关系                      | 说明                                    |
| ----------------------------------- | ----------------------------- | --------------------------------------- |
| `APP`                               | `App` alias                   | 兼容旧源直接读取 `APP.version` 等字段。 |
| `app`                               | `App` alias                   | 兼容小写全局对象写法。                  |
| `Http`                              | `Network` alias               | 兼容旧版网络 API 命名。                 |
| `HTML`                              | `Html` alias                  | 兼容旧版 HTML API 命名。                |
| `Storage`                           | `Data` alias                  | 兼容旧版数据存储 API 命名。             |
| `Console`                           | `Log` alias                   | 兼容旧版日志 API 命名。                 |
| `Data.loadData/saveData/deleteData` | `Data.load/save/delete` alias | 兼容旧版 Data 方法命名。                |
| `globalThis/self/window`            | sandbox self references       | 兼容浏览器式全局对象访问。              |
| `UI.toast`                          | log-backed shim               | 仅记录日志，不弹出真实 UI。             |

覆盖测试：`apps/server/test/runtimeApi.test.ts` 验证 API alias；`apps/server/fixtures/sources/mock.js` 提供 worker 集成路径。

### Debug 诊断 API

普通业务 API 仍保持安全输出：5xx 默认返回 `Internal server error`，不泄露插件 stack。

Debug API 会返回用于真实源排查的结构化诊断信息：

| 字段            | 说明                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `sourceKey`     | 当前源 key。                                                                            |
| `operation`     | 当前操作，如 `search`、`detail`、`pages`、`image`。                                     |
| `error.code`    | 分类后的插件错误码，如 `PLUGIN_API_MISSING`、`PLUGIN_NETWORK_ERROR`、`IMAGE_REJECTED`。 |
| `error.message` | 插件或 runtime 原始错误摘要。                                                           |
| `error.stack`   | 最多 6 行短 stack，仅 debug route 返回。                                                |
| `hint`          | 基于错误类型生成的排查建议。                                                            |

`GET /api/v1/debug/runtime/diagnostics` 还会记录最近插件错误和加载失败错误，包含 `sourceKey`、`operation`、`code`、`message`、短 stack。

### 图片加载 Hook

图片代理已支持以下最小兼容策略：

| Hook                        | 支持位置                  | 行为                                                           |
| --------------------------- | ------------------------- | -------------------------------------------------------------- |
| `getImageLoadingConfig`     | `source.comic` / `source` | 返回 URL、method、headers、data 等请求配置。                   |
| `onImageLoad`               | `source.comic`            | 作为 `getImageLoadingConfig` 的旧名兼容。                      |
| `getThumbnailLoadingConfig` | `source`                  | 缩略图请求配置。                                               |
| `onLoadFailed`              | `source.comic` / `source` | 首次请求构造或加载失败后，可返回新的 loading config 重试一次。 |
| `onResponse`                | `source.comic` / `source` | 非 OK 响应后，可返回新的 loading config 重试一次。             |
| `modifyImage`               | `source.comic` / `source` | 响应 bytes 读取后允许返回修改后的 bytes。                      |

当前实现刻意保持最小范围：`onLoadFailed` 和 `onResponse` 只用于一次 fallback/retry；`modifyImage` 支持 `Buffer`、`ArrayBuffer`、TypedArray、number array 或 `{ data }` 形态。

覆盖测试：`apps/server/test/apiWorkerIsolation.test.ts` 验证 Worker 模式下 `onLoadFailed`、`onResponse`、`modifyImage` 的图片链路。

### Worker 存储一致性

Worker 隔离模式下已验证以下一致性：

| 场景                                               | 预期                              |
| -------------------------------------------------- | --------------------------------- |
| 主进程导入 Cookie 后 Worker `Network.request`      | 后续请求能带上导入的 Cookie。     |
| Worker 调用 `Data.save` 后重载源                   | 重载后仍可通过 `Data.load` 读取。 |
| 主进程更新 source settings 后 Worker `loadSetting` | 后续插件调用可读取新设置。        |

当前实现：Cookie 管理由统一源协议在插件执行环境内完成，`importCookies` / `clearCookies` 直接更新正在使用的 Cookie jar，不再重载 Worker。所有插件统一在 Worker 内运行。

覆盖测试：`apps/server/test/apiWorkerIsolation.test.ts` 的 Cookie/Data/settings 一致性回归用例。

## 2026-09-29 统一源接口迁移

运行时代码已迁入 `packages/plugin-runtime`，目录和调用边界见 [server_architecture.md](server_architecture.md)。Worker 内使用 VeneraAdapter，修正了 Worker 搜索选项丢失、能力被一律标记为支持，以及聚合搜索筛选依赖原始插件函数的问题。

设置新增按定义校验和 callback 调用；账号新增密码登录、Cookie 字段校验、退出与状态查询。网页登录明确标记 unsupported。历史真实源矩阵是当时的验证记录，本次未联网重新验证所有源，不代表这些源当前全部可用。

当前仅支持 Worker 执行，内部保留 VM 上下文。上文 2026-05-25 记录中的 VM 模式和 `VENERA_PLUGIN_ISOLATION` 是历史配置，现已移除；兼容检查使用 `compat`，不再接受 `--isolation`。
