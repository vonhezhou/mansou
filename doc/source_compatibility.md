# 真实源兼容矩阵

本文件用于记录阶段 3 后续真实源验证结果。每个源至少记录搜索、详情、章节、图片四条主路径，以及 Cookie、代理、人机验证等限制。

| 源 | 搜索 | 详情 | 章节 | 图片 | 条件/限制 | 缺失 API |
| --- | --- | --- | --- | --- | --- | --- |
| mock | pass | pass | pass | pass | 离线 fixture | 无 |
| 待验证 1 | pending | pending | pending | pending | 待选择真实源 | 待记录 |
| 待验证 2 | pending | pending | pending | pending | 待选择真实源 | 待记录 |
| 待验证 3 | pending | pending | pending | pending | 待选择真实源 | 待记录 |

## 验证建议

1. 安装源后调用 `GET /api/v1/debug/:sourceKey/search?keyword=test`。
2. 选取一个搜索结果，调用 `GET /api/v1/debug/:sourceKey/comics/:comicId`。
3. 选取章节，调用 `GET /api/v1/debug/:sourceKey/comics/:comicId/episodes/:episodeId/pages`。
4. 选取图片，调用 `GET /api/v1/debug/:sourceKey/image?imageKey=...&comicId=...&episodeId=...`。
5. 将失败原因归类为网络、Cookie/登录、人机验证、缺失运行时 API、源脚本异常。
