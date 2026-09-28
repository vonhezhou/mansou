# Venera Web 技术设计

## 1. 背景与目标

`venera` 是 Flutter 漫画阅读应用，核心能力包括通过 JavaScript 插件扩展漫画源、聚合搜索、在线浏览、详情页、阅读器、收藏、历史、下载、图片缓存、账号与 Cookie 管理。`venera_web_poc` 已经验证了在 Node.js/TypeScript 环境中复用 Venera 插件的可行性：通过 Fastify 暴露 HTTP API，通过 Node `vm` 加载插件脚本，并提供 `ComicSource`、`Network`、`Html`、`Data`、`Log`、`App`、`Convert` 等兼容层。

`venera_web` 的目标是将 PoC 正式化为可长期维护、可部署在 NAS/服务器/本地桌面环境的 Web 漫画阅读项目。正式项目应复用 Venera 现有插件生态，同时提供稳定的服务端 API、现代 Web 前端、数据持久化、任务调度、插件兼容性验证、可观测性、安全隔离与部署能力。

## 2. 设计原则

- 插件兼容优先：优先复用 `venera/doc/js_api.md`、`venera/doc/comic_source.md` 中定义的 JavaScript API 和数据模型。
- 分层清晰：插件运行时、领域服务、持久化、HTTP API、Web 前端拆分为独立模块。
- 渐进正式化：保留 PoC 已验证路径，逐步替换内存状态、散落路由和直接文件操作。
- 默认单用户，保留多用户扩展点：首版面向个人 NAS 场景，数据模型预留 `userId` 和权限边界。
- 可测试、可诊断：插件兼容层、数据归一化、下载任务、图片代理必须有自动化测试和调试 API。
- 安全边界明确：插件是第三方可执行代码，必须按不可信代码处理。

## 3. 现状概览

### 3.1 venera 关键能力

- 插件管理：`ComicSourceManager` 从 `App.dataPath/comic_source` 加载 `.js` 文件，解析为 `ComicSource`。
- 插件模型：`Comic`、`ComicDetails`、`Comment`、`ComicChapters` 等定义在 `lib/foundation/comic_source/models.dart`。
- 插件 API：`Network`、`Html`、`UI`、`Convert`、`App`、`Data` 等由 `js_engine.dart` 和文档提供。
- 阅读能力：搜索、分类、排行、探索页、详情、章节、图片加载配置、评论、收藏、历史、下载、本地漫画。
- 图片加载：插件可通过 `getImageLoadingConfig` 和 `getThumbnailLoadingConfig` 定制请求 URL、Header、Body。

### 3.2 venera_web_poc 已验证能力

- 服务框架：Fastify + TypeScript + Zod。
- 插件仓库：拉取官方源索引，安装脚本到 `data/sources/scripts`。
- 插件运行时：Node `vm` 加载 `class extends ComicSource`，构建实例并调用 `init`。
- 兼容层：已实现 `Network`、`Html`、`HtmlDocument`、`Data`、`Log`、`App`、部分 `Convert`。
- API：源列表、源安装、源设置、Cookie 导入、单源搜索、聚合搜索、详情、章节图片、图片代理、下载任务、CBZ 导出。
- 存储：文件系统 JSON 数据、Cookie 文件、图片缓存、下载目录。
- 网络：支持 `VENERA_PROXY`、系统代理环境变量和 `VENERA_NO_PROXY`。
- Web UI：`public/index.html`、`app.js`、`style.css` 的最小可用界面。

### 3.3 PoC 主要不足

- 单文件路由和服务初始化，模块边界不利于扩展。
- Node `vm` 隔离能力有限，缺少执行资源限制、权限策略和插件信任模型。
- 持久化以 JSON 文件为主，缺少事务、索引、迁移、备份恢复和并发写控制。
- 下载任务在进程内调度，重启后运行中任务只标记失败，缺少可靠队列和断点续传。
- API 缺少版本化、统一错误格式、OpenAPI 文档和前后端契约测试。
- 前端只是验证 UI，尚未覆盖正式阅读器、详情、搜索、下载、设置等产品流程。
- 插件兼容层只覆盖常用子集，缺少系统性的插件兼容测试矩阵。

## 4. 总体架构

正式项目采用单仓库、前后端同构 TypeScript 的分层架构。首版建议仍以一个 Node.js 进程交付，内部拆分为明确模块；后续可将 Worker、下载器、插件运行时独立为进程或服务。

```text
venera_web
├── apps
│   ├── server          # Fastify API、任务调度、静态资源托管
│   └── web             # Web 前端应用
├── packages
│   ├── contracts       # API DTO、Zod schema、共享类型
│   ├── plugin-runtime  # Venera 插件兼容运行时
│   ├── core            # 漫画源、搜索、详情、阅读、收藏等领域服务
│   ├── storage         # SQLite/文件存储、迁移、仓储接口
│   └── shared          # 通用工具、日志、配置
├── data                # 默认运行数据目录，不提交业务数据
└── doc                 # 设计文档、计划、API 文档
```

### 4.1 运行时视图

```text
Browser
  |
  | HTTP/WebSocket
  v
Fastify API Gateway
  |
  +-- Source Service -------- Plugin Runtime Pool -------- Venera JS Plugin
  |                              |                         |
  |                              +-- Runtime API ----------+-- Network/Html/Data/Convert
  |
  +-- Search Service
  +-- Comic Service
  +-- Reader/Image Service ---- Image Cache
  +-- Download Service -------- Task Queue -------- File Downloads/CBZ
  +-- Library Service --------- Favorites/ReadLater
  |
  +-- Storage Layer ----------- SQLite + Data Files
```

## 5. 模块设计

### 5.1 Server 应用

职责：

- 提供 `/api/v1` REST API。
- 托管 Web 静态资源或反向代理开发服务器。
- 初始化配置、日志、数据库、插件运行时、任务队列。
- 提供健康检查、诊断接口、OpenAPI 文档。

建议路由分组：

- `/api/v1/health`：健康检查。
- `/api/v1/sources`：已安装源、安装、卸载、更新、重载、设置、Cookie。
- `/api/v1/source-repository`：源仓库索引、刷新、搜索。
- `/api/v1/search`：聚合搜索和单源搜索。
- `/api/v1/comics`：详情、章节、评论、评分、相关推荐。
- `/api/v1/images`：缩略图和阅读图片代理。
- `/api/v1/downloads`：下载任务、取消、重试、删除、导出。
- `/api/v1/library`：原规划的收藏、稍后阅读、本地下载库，当前未提供该路由组。
- `/api/v1/settings`：系统设置、网络代理、缓存策略。
- `/api/v1/debug`：插件调试，仅在调试模式启用或受权限保护。

### 5.2 Contracts 包

职责：

- 定义共享 DTO、Zod schema、错误码、分页模型。
- 从 schema 生成 OpenAPI 或作为 OpenAPI 的源数据。
- 统一前后端类型，避免前端手写接口类型。

核心模型：

- `SourceSummary`：`key`、`name`、`version`、`url`、`capabilities`、`installedAt`、`enabled`。
- `Comic`：对齐 Venera `Comic`，包含 `sourceKey`、`id`、`title`、`cover`、`subtitle`、`tags`、`description`、`language`、`stars`。
- `ComicDetails`：对齐 Venera `ComicDetails`，包含详情、章节、缩略图、推荐、评论统计等。
- `EpisodePages`：`sourceKey`、`comicId`、`episodeId`、`images`。
- `DownloadTask`：状态、阶段、进度、日志、输出路径、错误信息。
- `ApiError`：`code`、`message`、`details`、`requestId`。

### 5.3 Plugin Runtime 包

职责：

- 加载、校验、执行 Venera JavaScript 插件。
- 提供与 Flutter 版尽量一致的全局 API。
- 管理插件实例、插件数据、Cookie、设置、能力探测。
- 提供执行超时、并发控制、错误包装和调试信息。

运行时策略：

- 首版可沿用 Node `vm`，但应封装为 `RuntimeAdapter`，避免业务服务直接依赖 `vm`。
- 中期评估 `isolated-vm`、Worker Thread 或独立子进程，用于更强隔离和资源限制。
- 每个源维护独立上下文、Cookie Jar、Data 命名空间和配置。
- 运行时 API 必须按 `venera/doc/js_api.md` 建立兼容清单，标记 `implemented`、`partial`、`missing`、`not applicable`。

需要补齐的兼容层：

- `Network.fetchBytes`、`sendRequest`、`put`、`delete`、`patch` 与二进制响应语义。
- `Convert.sha512`、`hmac`、AES CBC/CFB/OFB、RSA 等文档中定义但 PoC 未完整实现的方法。
- `HtmlElement.nodes`、`parent`、文本节点处理等更完整 DOM API。
- `UI` 在 Web 端的替代协议，例如登录提示、验证码、需要用户操作的回调。
- WebView 登录和 Cloudflare/人机验证的受控流程。
- 评论、收藏、分类、探索页、排行、标签建议、归档下载等源能力。

### 5.4 Core 包

职责：

- 将插件原始返回值归一化为稳定领域模型。
- 实现聚合搜索、详情加载、章节页加载、图片加载配置、收藏、下载库。
- 屏蔽插件运行时差异和存储细节。

关键服务：

- `SourceService`：源安装、卸载、更新、启停、能力探测。
- `SearchService`：单源搜索、聚合搜索、超时控制、结果合并、错误部分失败返回。
- `ComicService`：详情、章节、缩略图、评论和操作类能力。
- `ImageService`：图片代理、缓存键、Content-Type 探测、Referer/User-Agent、重试。
- `DownloadService`：任务创建、调度、进度、重试、取消、CBZ 导出、断点续传。
- `LibraryService`：收藏、稍后阅读、下载完成作品索引。

### 5.5 Storage 包

首版推荐 SQLite + 文件系统混合存储。

Web 已移除阅读历史页面、接口及读写逻辑。新数据库不再创建 `history` 表；旧数据库中的历史表和数据保留但不再访问，迁移版本 4 仅保留版本标记。章节预览和下载记录不受影响。

SQLite 存储：

- `sources`：已安装源、版本、启用状态、脚本路径、安装时间。
- `source_settings`：源设置值。
- `source_cookies`：Cookie 元数据或加密后的 Cookie 内容索引。
- `plugin_data`：插件 `Data` 命名空间。
- `favorites`：本地收藏。
- `downloads`：下载任务和状态。
- `download_items`：下载图片明细、文件路径、状态、重试次数。
- `cache_entries`：图片缓存索引、大小、访问时间。
- `app_settings`：系统设置。

文件系统存储：

- `data/sources/scripts`：插件脚本。
- `data/cache/images`：图片缓存。
- `data/downloads`：下载文件和 CBZ。
- `data/logs`：可选日志文件。
- `data/backups`：配置和数据库备份。

### 5.6 Web 前端

建议使用 React + Vite + TypeScript，前端只通过 `/api/v1` 访问后端。

核心页面：

- 首页：源入口、最近阅读、下载进度、推荐或探索页。
- 源管理：源仓库、安装/更新/卸载、启停、设置、Cookie 导入。
- 搜索：聚合搜索、单源筛选、搜索选项、错误源提示。
- 漫画详情：封面、标题、标签、描述、章节、缩略图、推荐、操作按钮。
- 阅读器：长条/分页模式、预加载、进度保存、快捷键、移动端手势。
- 下载：任务队列、进度、日志、失败重试、CBZ 导出。
- 设置：代理、缓存、并发、数据目录、调试模式。

前端状态建议：

- 服务端状态使用 TanStack Query 或同类请求缓存。
- 阅读器局部状态本地管理，避免全局状态膨胀。
- 下载进度可先轮询，后续升级为 WebSocket/SSE。

## 6. API 设计约定

### 6.1 通用响应

成功响应直接返回资源对象或列表。失败响应统一为：

```json
{
  "error": {
    "code": "SOURCE_NOT_LOADED",
    "message": "Source not loaded: jm",
    "details": {},
    "requestId": "req_xxx"
  }
}
```

### 6.2 聚合搜索响应

聚合搜索必须支持部分失败，不能因为单个源失败导致整体失败。

```json
{
  "keyword": "test",
  "items": [
    {
      "sourceKey": "mock",
      "sourceName": "Mock Source",
      "status": "fulfilled",
      "result": { "comics": [], "next": null, "maxPage": null }
    },
    {
      "sourceKey": "bad-source",
      "sourceName": "Bad Source",
      "status": "rejected",
      "error": { "code": "PLUGIN_ERROR", "message": "..." }
    }
  ]
}
```

### 6.3 图片代理

图片接口建议从 PoC 的 query 形式升级为可缓存、可签名的资源 URL：

```text
GET /api/v1/images/:sourceKey?imageKey=...&comicId=...&episodeId=...&thumbnail=false
```

后续可增加短期 token，避免公开服务被滥用为任意 URL 代理。

## 7. 安全设计

- 插件脚本按不可信代码处理，默认不允许访问 Node 原生模块、文件系统、进程环境变量和任意全局对象。
- 插件网络请求统一走 `Network` 兼容层，便于代理、Cookie、超时、审计和域名限制。
- 调试接口默认关闭，或至少要求本地访问/认证。
- Cookie 和账号数据需要加密或提供清晰的本机明文风险提示。
- 图片代理需要限制请求来源和响应大小，避免 SSRF、内网探测和磁盘打满。
- 下载目录和文件名必须使用安全文件名，禁止路径穿越。
- 源仓库脚本安装前记录来源、版本、校验信息，后续支持签名或 hash 校验。

## 8. 可观测性与诊断

- 每个请求生成 `requestId`。
- 日志分为 `server`、`plugin-runtime`、`network`、`download`、`storage` 分类。
- 插件错误保留源 key、方法名、耗时、简化 stack、兼容层缺失提示。
- 提供 `/api/v1/debug/sources/:sourceKey/*` 用于搜索、详情、章节、图片加载调试。
- 下载任务保留最近 N 条日志，并持久化关键阶段。
- 增加兼容性报告：每个源的搜索、详情、章节、图片、设置、Cookie 状态。

## 9. 测试策略

- 单元测试：DTO 归一化、URL/缓存键、文件名安全、兼容 API。
- 集成测试：使用 `fixtures/sources/mock.js` 覆盖搜索、详情、章节、图片、下载。
- 插件兼容测试：选取常用真实源建立矩阵，记录需要 Cookie、代理、WebView、人机验证的条件。
- API 契约测试：基于 Zod/OpenAPI 验证后端响应和前端类型。
- E2E 测试：安装源、搜索、打开详情、阅读、下载的主路径。
- 回归测试：每次补齐兼容层时增加对应插件最小复现。

## 10. 部署设计

首版交付形态：

- `pnpm build && pnpm start` 本地运行。
- Docker 镜像，挂载 `/data` 保存源、数据库、缓存、下载。
- 环境变量沿用并规范 PoC 变量：`PORT`、`HOST`、`VENERA_DATA_DIR`、`VENERA_SOURCE_LIST_URL`、`VENERA_SOURCE_CDN_BASE_URL`、`VENERA_PROXY`、`VENERA_NO_PROXY`、`VENERA_REQUEST_TIMEOUT_MS`、下载并发等。

后续可选：

- 桌面壳或 PWA。
- 多用户认证。
- 远程同步和备份。
- 独立下载 Worker。

## 11. 迁移方案

从 `venera_web_poc` 到 `venera_web` 的迁移建议：

- 先整体复制 PoC 可运行代码，保持 API 主路径可用。
- 引入 monorepo 结构和共享 contracts，逐步拆分 `server.ts`。
- 将文件 JSON 状态迁移到 SQLite，保留旧数据导入工具。
- 将 `SourceRuntime` 拆分为运行时适配器、插件注册表、兼容 API、数据归一化。
- 引入正式 Web 前端，替换 `public` 最小 UI。
- 建立 mock 源测试和真实源兼容矩阵，按矩阵补齐运行时 API。

## 12. 里程碑验收标准

- 可以通过 Web UI 安装源、配置源、导入 Cookie。
- 至少 3 个真实源完成搜索、详情、章节、图片阅读主路径验证。
- 聚合搜索支持部分失败并展示错误源。
- 章节预览支持桌面和移动端基本体验，不保存阅读进度。
- 下载任务支持持久化、取消、重试、导出 CBZ。
- 重启服务后源、设置、Cookie、下载状态可恢复。
- 提供 Docker 部署文档和基础自动化测试。
