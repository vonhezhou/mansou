# 配置参考

运行时配置由服务端启动时读取。实现以 `apps/server/src/config/config.ts` 和 `apps/server/src/auth/config.ts` 为准。

## 配置加载

- **源码运行**：Node.js 不自动加载 `.env`，需在启动服务端、管理员或存储命令前显式导出环境变量。
- **Docker Compose**：`.env` 用于 Compose 变量替换，只有 `docker-compose.yml` 中传入容器的变量才影响服务。增加下载并发等配置时，需同时在服务的 `environment` 中增加对应项。
- **数据路径**：源码通过 `pnpm --filter @mansou/server ...` 启动时，默认目录是 `apps/server/data/`。容器固定使用 `/data`，默认映射到宿主机仓库下的 `./data/`；`.env` 的 `MANSOU_DATA_DIR` 不会覆盖当前 Compose 中写死的容器路径。

示例（在仓库根目录执行，启动前使用绝对数据路径）：

```bash
export MANSOU_DATA_DIR="$PWD/data"
export AUTH_MODE=none
pnpm start
```

管理员与存储命令必须使用与服务相同的数据目录。

## 网络与认证

下表为源码运行的默认值。镜像与 Compose 将 `AUTH_MODE` 默认设为 `required`；Compose 的端口发布默认只绑定宿主机 `127.0.0.1`。

| 变量                       | 默认值           | 说明                                                         |
| -------------------------- | ---------------- | ------------------------------------------------------------ |
| `HOST`                     | `0.0.0.0`        | 服务监听地址；源码开发也会监听网络接口                       |
| `PORT`                     | `3210`           | 服务端口；使用现有 Compose 时应保持与容器端口一致            |
| `MANSOU_BIND`              | `127.0.0.1`      | 仅用于 Compose 的宿主机端口绑定，不是服务端运行时变量        |
| `AUTH_MODE`                | `none`           | `none` 或 `required`                                         |
| `AUTH_ORIGIN`              | 空               | `required` 必填，浏览器访问的完整 origin，不带路径或末尾斜线 |
| `AUTH_SESSION_TTL_SECONDS` | `86400`          | 会话有效期，范围 60–2592000 秒                               |
| `MANSOU_PROXY`             | 继承系统代理变量 | HTTP/HTTPS 代理地址；显式空值禁用代理                        |
| `MANSOU_NO_PROXY`          | 继承系统绕过变量 | 逗号分隔的绕过域名；支持域名、域名后缀及 `*`                 |

系统代理按 `HTTPS_PROXY`、`https_proxy`、`HTTP_PROXY`、`http_proxy` 顺序取第一个已定义的值；绕过配置按 `NO_PROXY`、`no_proxy` 顺序读取。现有 Compose 为项目代理变量传入空值时，不会自动继承这些系统配置。

`MANSOU_ACCESS_TOKEN` 是已停用的旧共享 Token 配置，非空时启动会失败。使用管理员登录和独立 Bearer Token，详见 [鉴权说明](auth.md)。

## 源与运行时

| 变量                               | 默认值                                                                  | 说明                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `MANSOU_DATA_DIR`                  | 当前工作目录下的 `data/`                                                | 数据根目录，建议使用绝对路径                                                   |
| `MANSOU_SOURCE_LIST_URL`           | `https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json` | 外部插件源索引                                                                 |
| `MANSOU_SOURCE_CDN_BASE_URL`       | 空                                                                      | 源脚本下载的 CDN 基地址                                                        |
| `MANSOU_APP_VERSION`               | `1.15.0`                                                                | 插件兼容层声明的 Venera API 版本，**不是漫搜版本**；不要为跳过版本检查随意调高 |
| `MANSOU_LOCALE`                    | `zh_CN`                                                                 | 插件运行时语言区域                                                             |
| `MANSOU_REQUEST_TIMEOUT_MS`        | `60000`                                                                 | 网络请求超时，毫秒                                                             |
| `MANSOU_PLUGIN_CALL_TIMEOUT_MS`    | 请求超时值                                                              | 单次插件调用超时，毫秒；超时会终止相应实例，后续需要重载                       |
| `MANSOU_PLUGIN_SOURCE_CONCURRENCY` | `4`                                                                     | 单源插件调用并发上限                                                           |

运行时只使用 Worker 执行，Worker 内使用 VM；这不构成操作系统级安全隔离。当前没有可切换的插件隔离模式。源兼容限制见 [源兼容记录](source_compatibility.md)。

## 下载与缓存

| 变量                               | 默认值       | 说明                                                 |
| ---------------------------------- | ------------ | ---------------------------------------------------- |
| `MANSOU_DOWNLOAD_CONCURRENCY`      | `4`          | 下载图片并发数                                       |
| `MANSOU_DOWNLOAD_TASK_CONCURRENCY` | `1`          | 每个调度器同时执行的下载任务数（漫画、小说分别计算） |
| `MANSOU_DOWNLOAD_RETRIES`          | `3`          | 每张图片或小说章节最大尝试次数（含首次）             |
| `MANSOU_MAX_IMAGE_BYTES`           | `20971520`   | 单张图片大小上限，20 MiB                             |
| `MANSOU_IMAGE_CACHE_MAX_BYTES`     | `1073741824` | 图片缓存容量上限，1 GiB；`0` 不限制缓存容量          |

超时、并发、重试和图片大小上限须为正安全整数，图片缓存容量可为零。高并发会增加站点压力和资源占用，建议先使用默认值，再根据实际日志调整。

数据目录中的 `mansou.sqlite` 保存业务与认证状态及下载目的地设置，`sources/` 保存插件索引与脚本，`cache/images/` 保存图片缓存。下载文件写入任务指定的公共或个人目录，默认位于数据目录内。下载文件不会因图片缓存容量限制自动清理，应自行管理磁盘空间。

### 公共与个人下载目的地

在网页“系统设置 → 下载目的地”中配置两个服务器绝对路径及默认目的地。Docker 部署时填写容器内路径，宿主机路径通过卷挂载映射，示例见[部署说明](deployment.md#公共与个人目录挂载)。

| 设置 | 首次使用的默认值 | 用途 |
| --- | --- | --- |
| 公共目录 | 之前保存的下载目录，未设置时为 `<数据目录>/downloads` | 公共书籍和漫画的下载根目录 |
| 个人目录 | 公共目录的同级目录，目录名追加 `-personal` | 个人书籍和漫画的下载根目录 |
| 默认目的地 | 公共 | 打开漫画或小说下载详情时的初始选择 |

例如容器使用 `/data` 且之前没有自定义下载目录时，公共与个人目录分别为 `/data/downloads` 和 `/data/downloads-personal`。保存设置时会创建目录、检查写权限，并保存解析软链接后的实际路径。两个目录必须独立，相同目录、互相包含或经软链接指向重叠位置都会被拒绝。

漫画和小说的下载入口都提供“公共 / 个人”选择。漫画写入所选根目录下的源与作品目录，小说写入 `<所选根目录>/novels/<任务 ID>/`，直接下载到目的地。任务列表显示公共、个人或自定义目录标签。历史任务按实际路径识别归属，无法对应当前设置的显示为自定义目录。

创建任务时固定实际路径和目的地。修改设置只影响新建任务，已有任务的暂停恢复、重试和导出继续使用原路径。同一作品可分别下载到两个目的地，同一目录内继续沿用原有的下载范围去重规则。目标目录不可写时会明确报错，另一独立目的地仍可使用。

接口设置为 `GET /api/v1/settings/downloads` 和 `PUT /api/v1/settings/downloads`，保存时提交完整配置。

```json
{
  "publicDir": "/library/public",
  "personalDir": "/library/personal",
  "defaultDestination": "public"
}
```

漫画与小说创建下载任务时使用可选的 `destination` 字段，取值为 `public` 或 `personal`，省略时由服务端使用当前默认目的地。路径由服务端解析。任务响应中的 `downloadDir` 保存实际路径，`destination` 表示目的地，历史任务还可能返回 `custom`。
