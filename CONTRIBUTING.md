# 贡献指南

感谢你参与漫搜。当前产品范围是漫画源管理、搜索、聚合搜索、章节预览与下载，面向个人 NAS/VPS 自托管。

## 提交问题

请先搜索 [已有 Issues](https://github.com/vonhezhou/mansou/issues)，并提供：

- 使用的提交 SHA（`git rev-parse HEAD`）、部署方式、操作系统与 Node.js 或 Docker 版本。
- 最小复现步骤、预期结果和实际结果。
- 源相关问题需补充源名称与版本、失败环节（安装、搜索、详情、图片或下载）。
- 必要的脱敏日志或截图；区分网络错误、需要登录、站点限制与运行时错误。

不要上传密码、Cookie、API Token、私人域名、完整数据目录或数据库。安全漏洞按 [安全反馈说明](SECURITY.md) 私下报告。

功能建议请说明使用场景和要解决的问题。大范围重构或超出当前产品范围的功能，建议先开 Issue 讨论。

## 开发与验证

环境和启动步骤见 [README](README.md#本地开发)。包名统一使用 `@mansou/*`，内部依赖通过 pnpm workspace 管理。

提交前按改动范围验证；与 CI 一致的完整检查为：

```bash
pnpm --filter @mansou/contracts generate:check
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

首次克隆或修改工作区依赖后，先构建再运行依赖其他包产物的测试。部分服务端测试需要监听本机回环端口；在禁止监听端口的沙箱中可能出现 `listen EPERM`。请在具备该权限的环境执行，勿通过跳过用例掩盖失败。

可只运行直接受影响的包，例如：

```bash
pnpm --filter @mansou/server test
pnpm --filter @mansou/web test
pnpm --filter @mansou/storage test
```

界面变化请检查桌面、窄屏、浅色和深色模式，并在 PR 中附截图。文档变化检查命令、路径、链接和示例是否与当前实现一致。

## API 与插件修改

`packages/contracts/openapi.yaml` 是 HTTP 契约的唯一源文件。修改接口后运行：

```bash
pnpm --filter @mansou/contracts generate
pnpm --filter @mansou/contracts generate:check
```

将 YAML 和生成文件一同提交，不直接编辑 `*.generated.ts`。同步调整服务端与同仓库网页调用，并为业务规则、权限边界和失败恢复补充必要回归用例。

Venera 兼容逻辑放在 `packages/plugin-runtime/src/adapters/venera`；业务服务依赖统一源接口，不直接访问插件原始对象。验证真实源时使用独立 `MANSOU_DATA_DIR`，避免污染日常使用的数据。真实源结果会随站点和网络变化，请注明验证时间与条件。

## Pull Request

- 一个 PR 聚焦一个问题，沿用相邻代码风格，避免无关重构和批量格式化。
- 说明改动原因、最终行为、验证结果及已知限制。
- 行为或配置变化时同步更新相关文档。
- 不提交 `.env`、`data/`、依赖目录、构建产物、个人凭据或无授权的第三方内容。
- 引入第三方代码或资源时保留来源和许可；不将与项目 MIT 分发方式不兼容的代码直接并入仓库。

提交信息使用 Conventional Commits，例如：

```text
fix(downloads): 修复暂停任务恢复后的进度更新
docs(readme): 补充本地开发步骤
```

提交贡献即表示你有权提供该贡献，并同意按本仓库的 [MIT License](LICENSE) 许可自己的贡献；第三方材料仍须保留其适用许可。
