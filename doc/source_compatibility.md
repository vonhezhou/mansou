# 真实源兼容矩阵

本文件用于记录阶段 3 后续真实源验证结果。每个源至少记录搜索、详情、章节、图片四条主路径，以及 Cookie、代理、人机验证等限制。

| 源 | 搜索 | 详情 | 章节 | 图片 | 条件/限制 | 缺失 API |
| --- | --- | --- | --- | --- | --- | --- |
| mock | pass | pass | pass | pass | 离线 fixture | 无 |
| baozi | pass | pass | pass | pass | 安装/初始化时会刷新源域名，本次耗时约 108s；后续网络状态可能影响初始化 | 无 |
| Komiic | pass | pass | pass | pass | 图片接口需要 `comic.onImageLoad` 返回的 referer/user-agent；已在运行时兼容 | 无 |
| comick | pass | pass | pass | fail | 图片 CDN 返回 403；需要继续确认 headers、referer、Cookie 或 Cloudflare 限制 | 待确认图片加载策略 |
| manga_dex | fail | pending | pending | pending | 搜索阶段失败：`ReferenceError: APP is not defined` | `APP` 全局兼容层 |
| ykmh | pass | pass | pass | fail | 漫画/章节 ID 是完整 URL，需使用 query 形式接口；图片 URL 本次返回 404 | 待确认图片加载策略或源侧图片 URL 有效性 |
| copy_manga | fail | pending | pending | pending | 安装后 `init` 触发后台网络刷新，`ECONNRESET` 以未捕获 Promise 形式导致进程退出 | 插件异步任务错误隔离/生命周期保护 |

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
