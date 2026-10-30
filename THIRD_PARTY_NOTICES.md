# 第三方说明

## 本仓库的许可范围

漫搜仓库现有许可证为 [MIT License](LICENSE)。该许可证适用于本项目有权以 MIT 许可提供的代码与文档，不会将上游项目、外部插件、依赖或漫画内容重新许可为 MIT。

## Venera 生态

漫搜通过 `packages/plugin-runtime/src/adapters/venera` 实现 Venera 漫画源插件 API 的兼容，协议背景来自 [Venera 项目](https://github.com/venera-app/venera)。Venera 上游采用 GNU GPL v3，使用或再分发其代码时应遵守对应版本的实际许可证。

默认源索引来自 [venera-configs](https://github.com/venera-app/venera-configs)，服务通过网络获取索引并按用户操作安装插件。外部仓库、各插件脚本和内容站点可能有各自的许可、访问条款及授权要求，应分别核实。

兼容 API 和引用项目名称不代表获得上游背书，也不代表可以将 GPL 上游实现复制后按 MIT 分发。后续若引入上游代码、资源或其他第三方材料，应记录具体来源、版本、适用许可并保留要求的声明；存在许可冲突时，应先解决授权或实现方式问题。

## 软件依赖

运行与开发依赖记录在各包的 `package.json` 和根目录 `pnpm-lock.yaml` 中，各依赖遵循自身的许可证。发布源码、构建产物或 Docker 镜像时，应保留所分发第三方材料要求的许可与版权声明。

## 漫画内容

本仓库不附带漫画内容。通过插件访问的内容由对应站点或权利人提供；软件的开源许可不授予对漫画内容的复制、传播或商业使用权。
