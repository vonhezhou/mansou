# 第三方说明

## 本仓库的许可范围

漫搜仓库现有许可证为 [MIT License](LICENSE)。该许可证适用于本项目有权以 MIT 许可提供的代码与文档，不会将上游项目、外部插件、依赖或漫画内容重新许可为 MIT。

## Venera 生态

漫搜通过 `packages/plugin-runtime/src/adapters/venera` 实现 Venera 漫画源插件 API 的兼容，协议背景来自 [Venera 项目](https://github.com/venera-app/venera)。Venera 上游采用 GNU GPL v3，使用或再分发其代码时应遵守对应版本的实际许可证。

默认源索引来自 [venera-configs](https://github.com/venera-app/venera-configs)，服务通过网络获取索引并按用户操作安装插件。外部仓库、各插件脚本和内容站点可能有各自的许可、访问条款及授权要求，应分别核实。

兼容 API 和引用项目名称不代表获得上游背书，也不代表可以将 GPL 上游实现复制后按 MIT 分发。后续若引入上游代码、资源或其他第三方材料，应记录具体来源、版本、适用许可并保留要求的声明；存在许可冲突时，应先解决授权或实现方式问题。

## 小说书源与 Legado

`packages/novel-engine` 基于本项目作者编写、尚未发布的 `legado_book_source` 独立预研代码，由作者以 MIT 许可引入本仓库。第三方 Legado 项目采用 GPL-3.0，作为书源格式和规则行为参考；本次未将 Legado 仓库的 Kotlin/Java 实现代码复制或翻译纳入本仓库。

兼容书源格式、独立实现运行时或加载 JSON 不表示将第三方项目重新许可。用户自行导入的书源及其中可能包含的脚本、站点内容分别受其原有许可或权利约束。本仓库不内置第三方书源合集；书源 JS 与用户配置的脚本库在 QuickJS/WASM 中隔离执行，不向其提供 Node 或完整 JVM。若随软件分发第三方书源或上游代码，应另外核实并履行对应许可。

动态书源运行时使用 `quickjs-emscripten`（及其 QuickJS/WASM 依赖）、`jsonpath-plus`、`@xmldom/xmldom`、`xpath` 和 `tough-cookie`。它们作为独立软件依赖引入，不是 Legado Kotlin/Java 代码的复制或翻译；具体版本和许可见锁文件及各依赖随附声明。

## 软件依赖

运行与开发依赖记录在各包的 `package.json` 和根目录 `pnpm-lock.yaml` 中，各依赖遵循自身的许可证。发布源码、构建产物或 Docker 镜像时，应保留所分发第三方材料要求的许可与版权声明。

## 漫画与小说内容

本仓库不附带漫画或小说内容。通过插件访问的内容由对应站点或权利人提供；软件的开源许可不授予对漫画或小说内容的复制、传播或商业使用权。
