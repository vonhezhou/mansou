# Venera Web

Venera Web 是 Venera 漫画源插件生态的 Web 化实现。项目使用 pnpm monorepo，提供 Fastify 服务、React Web 客户端、插件运行时、图片代理和下载管理。支持可信局域网免登录，以及公网单管理员登录与客户端 API Token。

## 项目结构

```text
apps/server          Fastify API、插件运行时、鉴权和静态资源
apps/web             React/Vite Web 客户端
packages/contracts   OpenAPI YAML、生成类型和共享 schema
packages/core        领域服务占位
packages/plugin-runtime 插件运行时包占位
packages/storage     SQLite 业务与鉴权存储
packages/shared      通用工具占位
doc                  设计文档和执行计划
```

## 开发

```bash
pnpm install
pnpm build
pnpm dev
```

开发页面为 `http://localhost:5173`，API 服务为 `http://localhost:3210`，健康检查为 `GET /health`。源码运行未配置鉴权时默认免登录；公网部署按 `doc/deployment.md` 配置 HTTPS 与 required 模式。

## 常用命令

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## 配置

Compose 可复制 `.env.example` 后修改；源码运行需显式导出环境变量，Node.js 不自动加载 `.env`。常用变量包括：

- `AUTH_MODE`、`AUTH_ORIGIN`、`AUTH_SESSION_TTL_SECONDS`
- `PORT`、`HOST`
- `VENERA_DATA_DIR`
- `VENERA_SOURCE_LIST_URL`
- `VENERA_SOURCE_CDN_BASE_URL`
- `VENERA_PROXY`、`VENERA_NO_PROXY`
- `VENERA_REQUEST_TIMEOUT_MS`

## 文档

- `doc/technical_design.md`
- `doc/execution_plan.md`
- `doc/deployment.md`
- `doc/api.md`

- `doc/auth.md`：管理员初始化、登录、API Token、密码恢复及旧配置迁移
