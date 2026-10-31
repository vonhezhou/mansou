# 漫搜 · Mansou

面向 NAS 和 VPS 自托管的多源漫画搜索与下载工具，兼容 Venera 漫画源插件生态，并提供实验性的小说搜索与 TXT 下载。

通过浏览器管理漫画源、搜索漫画、预览章节并下载到服务器，无需安装桌面客户端。项目仍在持续开发，当前面向个人使用，支持单管理员登录与独立 API Token。

## 功能

- **小说（实验）**：独立小说源管理、书源 JSON 与合集订阅、搜索与聚合搜索；可恢复的章节下载与 TXT 导出并入统一下载任务，支持有限规则子集，详见 [小说说明](doc/novels.md)。
- **多源搜索**：单源搜索、聚合搜索、详情与章节列表。
- **源管理**：安装、更新、启停、配置，以及插件支持的账号与 Cookie 登录。
- **章节预览**：查看章节图片，确认内容后创建下载任务。
- **下载管理**：单章或全本下载、暂停与继续、失败重试、任务恢复、CBZ 导出。
- **自托管**：SQLite 持久化、图片代理与缓存、Docker Compose 部署。
- **访问控制**：可信局域网免登录，或单管理员登录、会话管理及 API Token。

当前不提供完整阅读器、阅读进度同步或多用户账号体系。需要 WebView、交互式验证码等能力的插件可能无法使用；第三方源的可用性也受网络和站点变更影响。

## 快速开始

### Docker Compose：可信局域网试用

需要 Docker Engine 和 Docker Compose v2。当前从源码构建镜像，不依赖预发布镜像。

```bash
git clone https://github.com/vonhezhou/mansou.git
cd mansou
cp .env.example .env
```

将 `.env` 中以下三项调整为：

```dotenv
AUTH_MODE=none
AUTH_ORIGIN=
MANSOU_BIND=0.0.0.0
```

启动服务：

```bash
docker compose up -d --build
```

打开 `http://服务器局域网地址:3210`。数据保存在仓库下的 `data/`，重建容器时应保留该目录。

免登录模式允许所有能够访问该端口的人操作源、下载任务及文件，仅用于可信网络。**公网部署请使用登录模式和 HTTPS**，完整步骤见 [部署说明](doc/deployment.md)。

### 首次使用

1. 打开“源”，刷新可安装源列表并安装需要的漫画源。
2. 在“当前操作源”中完成该源所需的设置、账号登录或 Cookie 导入。
3. 打开“搜索”，选择单源或聚合搜索，输入关键词。
4. 在详情中预览章节，创建单章或全本下载任务。
5. 在“下载”中查看进度、重试失败项或导出 CBZ。

下载由服务端执行，文件位于服务端数据目录，而非浏览器所在设备；导出后可通过浏览器保存到本机。仅安装可信来源的插件，插件脚本会在服务端执行。

## 本地开发

环境与 CI 保持一致：Node.js 22（22.12 或更高的 22.x 版本）、`package.json` 指定的 pnpm 版本（当前为 12.3.4）。可使用 Corepack 管理 pnpm：

```bash
git clone https://github.com/vonhezhou/mansou.git
cd mansou
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

开发页面为 `http://localhost:5173`，API 服务为 `http://localhost:3210`，Vite 代理同源 `/api` 请求。`pnpm build` 会先生成工作区依赖包的构建产物；`pnpm dev` 同时启动服务端与网页开发服务。

源码运行默认免登录，开发服务会监听网络接口，请在可信环境中运行。Node.js 不自动读取 `.env`，需要显式导出环境变量。源码运行的数据默认位于 `apps/server/data/`，不同于 Compose 的仓库根目录 `data/`。

构建后可执行 `pnpm start`，由服务端在 `http://localhost:3210` 同时提供网页和 API。登录模式的开发配置见 [部署说明](doc/deployment.md#本地开发)。

## 配置与文档

项目配置使用 `MANSOU_*` 环境变量，认证使用 `AUTH_*`。数据库文件名为 `mansou.sqlite`。Compose 会读取 `.env` 做变量替换；实际传入容器的项目配置以 `docker-compose.yml` 的 `environment` 为准。

| 文档                                      | 内容                                       |
| ----------------------------------------- | ------------------------------------------ |
| [部署说明](doc/deployment.md)             | Docker、NAS/VPS、HTTPS、升级与备份恢复     |
| [配置参考](doc/configuration.md)          | 环境变量、默认值、数据目录与代理           |
| [鉴权说明](doc/auth.md)                   | 管理员初始化、API Token、密码恢复          |
| [API 文档](doc/api.md)                    | OpenAPI 契约、请求与响应、SSE              |
| [服务端架构](doc/server_architecture.md)  | 领域服务、插件运行时与存储边界             |
| [前端架构](doc/web_architecture.md)       | 网页结构与交互约定                         |
| [源兼容记录](doc/source_compatibility.md) | 历史验证结果与排查流程，并非实时可用性承诺 |

其他设计资料见 [文档索引](doc/README.md)。

## 项目结构

```text
apps/server              Fastify API、认证、业务服务与部署入口
apps/web                 React/Vite 网页客户端
packages/contracts       OpenAPI YAML、生成类型与运行时契约
packages/core            源接口与领域模型
packages/plugin-runtime  Venera 插件适配、宿主能力与 Worker 执行器
packages/novel-engine    文本书源规则、搜索、目录与正文解析
packages/storage         SQLite 业务数据与认证存储
packages/shared          共享工具包（预留）
doc                      使用、部署与架构文档
```

## 参与项目

欢迎提交可复现的问题和聚焦的改进。提交方式与验证命令见 [贡献指南](CONTRIBUTING.md)，安全问题请按 [安全反馈说明](SECURITY.md) 私下报告。

## 许可与致谢

本仓库使用 [MIT License](LICENSE)。Venera、漫画源插件、第三方依赖及漫画内容分别受其自身许可或权利约束，MIT 许可不覆盖这些第三方项目和内容。

感谢 [Venera](https://github.com/venera-app/venera) 及其插件生态。上游关系和第三方使用边界见 [第三方说明](THIRD_PARTY_NOTICES.md)。请在获得授权的范围内访问和下载内容。
