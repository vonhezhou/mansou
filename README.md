# Venera Web

Venera Web 是 Venera 漫画源插件生态的 Web 化实现。当前仓库处于正式化迁移阶段，阶段 0 已建立 pnpm monorepo 骨架，并迁移 `venera_web_poc` 的 Fastify 服务、插件运行时、图片代理、下载服务、mock 源和最小 Web UI。

## 项目结构

```text
apps/server          Fastify API、PoC 运行时和静态 UI
apps/web             正式 Web 前端占位，后续阶段实现
packages/contracts   共享 Zod schema 和 TypeScript 类型
packages/core        领域服务占位
packages/plugin-runtime 插件运行时包占位
packages/storage     存储层占位
packages/shared      通用工具占位
doc                  设计文档和执行计划
```

## 开发

```bash
pnpm install
pnpm dev
```

默认服务地址为 `http://localhost:3210`，健康检查为 `GET /health`。

## 常用命令

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## 配置

复制 `.env.example` 后按需设置环境变量。常用变量包括：

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
