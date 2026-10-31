# 小说集成验收

执行顺序与最新状态见 [任务计划](../tasks/novel-integration-plan.md)。运行前先构建：`pnpm build`。工具只启动本地测试服务，不使用已有数据目录；在线复核另行指定用户提供的书源快照。

## 合成长篇与恢复

```sh
pnpm verify:novels --chapters 1000 --output /tmp/novels-long.json
```

工具启动本地 HTTP 站点和生产服务子进程，覆盖目录分页、正文分页、重复目录项、纯空白占位、暂停继续、SIGKILL 后恢复、删除一个章节缓存后重抓、一次 HTTP 503 后手动恢复，并把最终 TXT 与已知完整内容做 SHA-256 比较。阶段末关闭服务，将整个数据复制到新目录并移除原临时目录，再启动验证备份恢复和导出一致性。

报告记录实际 Node/平台、事件、章节请求数、RSS 和运行中健康检查响应时间。全部数据为合成内容；本地低延迟夹具的吞吐和耗时不代表真实站点或 NAS。

CI 使用 120 章执行相同故障流程，本地另验收 1000 章。`--server-entry` 可指定 pnpm deploy 产物的 `dist/server.js`，证明运行不依赖仓库工作目录。用 Node 22 执行脚本时，子服务也使用同一版本；SQLite 原生模块必须与该运行时匹配。

## 持续运行

```sh
pnpm verify:novels --chapters 40 --soak-minutes 60 --output /tmp/novels-soak.json
```

先执行一次完整故障恢复，再在同一个服务进程中重复订阅刷新、下载、TXT 哈希校验和清理；每三轮取消一个任务后重新创建，每五轮注入一次失败并恢复。采样持续覆盖运行和空闲阶段，最终记录首末一分钟平均 RSS、峰值和健康检查结果。

运行时报告中的 `soak.running=true` 表示尚未验收完成。只有进程成功退出、报告 `passed=true` 且 `soak.running=false` 才能认定该轮通过。RSS 的短时变化不直接等于泄漏或证明无泄漏，需要结合持续趋势判断。

后台执行时应保存 PID、命令、日志和报告路径，并设置有限时长。自动续跑先检查原任务，不能重复启动。验证期间不要覆盖正在使用的部署产物。

## 真实书源复核

```sh
node scripts/verify-novel-sources.mjs \
  --sources /path/to/baseline-sources.json \
  --output /tmp/novels-sources.json
```

工具读取外部原始 JSON，逐源搜索“凡人”，使用首个结果解析详情和完整目录，抓取前、中、后各一项作为样章。全局每秒最多一次请求，报告分别记录搜索、目录和正文阶段，保留源快照摘要、章节字符数和正文哈希。失败不自动推断为需要浏览器，不自动改写书源或扩大兼容层。

未遍历完的目录、无法访问的站点或失败样章必须如实记录，不能算作全链路通过。该检查不证明作品完结、站点没有缺章或能持续下载整本。

## 当前证据与环境边界

- [1000 章恢复报告](verification/2026-10-31-long-1000.json)：macOS arm64 / Node 26，63.299 秒，RSS 峰值约 186.30 MiB，63 次健康检查全部成功，TXT 1947614 字节且哈希一致。
- [独立生产包报告](verification/2026-10-31-production-package.json)：独立目录中完成 120 章恢复验收。
- [Node 22 生产运行报告](verification/2026-10-31-node22-production.json)：macOS arm64 / Node 22.23.4，同样完成 120 章验收。

- [Node 22 跨目录备份恢复](verification/2026-10-31-node22-production-backup.json)：关闭后复制完整数据，在新目录重启，源、任务与 TXT 哈希一致。
- [五源在线复核](verification/2026-10-31-five-sources.json)：5 个源搜索均有结果；4 个源取得完整目录及前中后样章，精华书阁手机版在 100 页/2000 项上限处仍未遍历完，未继续中后章节或整本验证。样章提取不等于正文质量、目录顺序、作品完整性或长期可用性验收。

以上不等于 Docker/Linux/目标 NAS 已通过。本机缺少 Docker 环境，容器实跑仍待验证；一小时运行尚在执行，完成前不能记为通过。
