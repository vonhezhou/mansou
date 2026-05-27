# Venera Web UI 重构计划

## 背景

`venera_web/apps/web` 当前仍处于未上线阶段，可以进行较大幅度的 UI 和结构重构。重构目标不是做临时修补，而是在保证回归通过的前提下，建立后续可持续迭代的正式前端结构。

本次重构应避免为了兼容当前 PoC 结构而做折中方案。若现有结构不适合目标产品形态，应直接重构到更合理的实现。

## 产品定位

`apps/web` 的核心定位是 Venera Web 控制台，重点能力是：

- 搜索漫画。
- 聚合多个源搜索。
- 查看漫画详情。
- 查看章节列表。
- 预览章节图片，用于确认源是否可用、内容是否正确。
- 创建下载任务。
- 管理下载任务。
- 管理源、源设置、Cookie。
- 查看历史记录。

明确不做：

- 不做完整漫画阅读器。
- 不做沉浸式阅读体验。
- 不做上一章/下一章阅读流程。
- 不做完整阅读进度系统。
- 不把历史页设计成“继续阅读”中心。
- 不新增独立 `reader` 模块。
- 不把章节图片预览做成主路径。

当前已有的图片展示能力应重新定位为 `ChapterPreview`，即章节预览。文案应从“阅读器”“开始阅读”调整为“章节预览”“预览章节”。

## 总体目标

- 将 Web 从 PoC 调试台升级为正式控制台。
- 重塑信息架构，让主路径从“搜索到下载”更顺畅。
- 拆分过大的 `App.tsx` 和 `SearchView.tsx`。
- 建立稳定的 UI 组件和样式系统。
- 保持现有 API 行为不倒退。
- 优先保证桌面端效率，同时兼顾移动端可用性。
- 不做临时方案，不保留无必要的旧结构兼容层。

## 当前问题

当前结构大致为：

```text
src/
  App.tsx
  styles.css
  views/
    SearchView.tsx
    DownloadsView.tsx
    HistoryView.tsx
    SourcesView.tsx
  api/
  lib/
  types.ts
```

主要问题：

- `App.tsx` 聚合了大量状态、API 调用、页面切换和顶层布局。
- `SearchView.tsx` 同时承担搜索表单、聚合源选择、结果列表、漫画详情、章节选择、下载入口和图片展示。
- `styles.css` 是单文件全局样式，缺少 token、组件层、页面层边界。
- 视觉语言仍是 PoC 控制台风格。
- 下载是核心目标，但当前搜索详情里的下载入口不够突出。
- 章节图片展示文案偏“阅读器”，容易误导产品方向。
- 全局 `busy` 粒度太粗，一个操作容易影响整页按钮状态。
- 空状态、错误状态、危险操作、加载状态没有统一设计。

## 信息架构

主导航保留四个一级模块：

```text
搜索
历史
下载
源管理
```

模块定位：

- 搜索：发现漫画、聚合搜索、查看详情、选择章节、创建下载、章节预览。
- 历史：最近查看过或操作过的漫画记录，用于快速回到详情或重新创建下载，不强化继续阅读。
- 下载：下载任务中心、失败项处理、CBZ 导出、缓存管理。
- 源管理：源安装、启用禁用、源设置、Cookie 导入、仓库刷新。

不新增一级 `Reader`。

## 目标目录结构

最终建议结构：

```text
src/
  app/
    AppShell.tsx
    navigation.ts
  components/
    ui/
      Badge.tsx
      Button.tsx
      EmptyState.tsx
      Field.tsx
      Panel.tsx
      SelectField.tsx
      TextAreaField.tsx
      Toolbar.tsx
    layout/
      PageHeader.tsx
      SectionHeader.tsx
      SplitPane.tsx
  features/
    search/
      SearchView.tsx
      SearchControls.tsx
      AggregateSourcePicker.tsx
      SearchResults.tsx
      ComicCard.tsx
      ComicDetailsPanel.tsx
      ChapterSelector.tsx
      ChapterPreview.tsx
      DownloadActions.tsx
    downloads/
      DownloadsView.tsx
      DownloadSummary.tsx
      DownloadTaskCard.tsx
      DownloadItemsList.tsx
      CachePanel.tsx
    sources/
      SourcesView.tsx
      SourceRepositoryPanel.tsx
      InstalledSourcesList.tsx
      SourceSettingsPanel.tsx
      CookieImportPanel.tsx
    history/
      HistoryView.tsx
      HistoryItemCard.tsx
  api/
    client.ts
    venera.ts
  lib/
    downloads.ts
    history.ts
  styles/
    tokens.css
    base.css
    layout.css
    components.css
    views.css
  types.ts
  main.tsx
  App.tsx
```

未上线阶段允许直接迁移到目标结构，不需要为了旧目录保留过渡兼容文件。

## 阶段 1：视觉基线与样式系统

目标：建立统一视觉规则，不改变业务语义。

工作内容：

- 拆分或重组 `styles.css`。
- 建立 CSS 变量。
- 统一按钮、输入框、面板、卡片、标签、错误提示、空状态。
- 统一移动端断点。
- 去掉大面积强渐变和过度 PoC 感的样式。
- 建立危险操作样式，例如删除下载任务、删除文件、清空 Cookie、清空缓存。
- 建立成功、警告、错误、信息、禁用、处理中等状态色。

建议 token：

```css
:root {
  --color-bg: #070b14;
  --color-surface: #0f172a;
  --color-surface-2: #111c2f;
  --color-border: #233047;
  --color-text: #e5edf8;
  --color-muted: #8ea0b8;
  --color-primary: #4f8cff;
  --color-primary-strong: #2563eb;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-success: #22c55e;

  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;

  --shadow-panel: 0 18px 60px rgba(0, 0, 0, 0.28);
}
```

验收标准：

- 页面视觉比当前更稳定、更正式。
- 手机端不横向溢出。
- 按钮和表单控件风格统一。
- 危险操作和普通操作能明显区分。
- 不改变 API 行为。

## 阶段 2：AppShell 重构

目标：把应用壳层和业务页面分离。

新增：

```text
src/app/AppShell.tsx
src/app/navigation.ts
```

`AppShell` 负责：

- 顶部或侧边导航。
- 品牌信息。
- 服务状态。
- Token 输入。
- 刷新按钮。
- 全局错误展示。
- 主内容容器。

推荐桌面布局：

```text
┌─────────────┬──────────────────────────────┐
│ Sidebar     │ Top Bar                      │
│ 搜索         │ 服务状态 / Token / 刷新       │
│ 历史         ├──────────────────────────────┤
│ 下载         │ Page Content                 │
│ 源管理       │                              │
└─────────────┴──────────────────────────────┘
```

推荐移动布局：

```text
┌──────────────────────────────┐
│ Compact Header               │
├──────────────────────────────┤
│ Page Content                 │
├──────────────────────────────┤
│ Bottom Navigation            │
└──────────────────────────────┘
```

验收标准：

- `App.tsx` 的 JSX 明显减少。
- 页面导航视觉稳定。
- 服务在线/离线状态明确。
- Token 输入不抢占主视觉。
- 刷新动作仍可用。

## 阶段 3：搜索页重构

目标：把核心主路径“搜索 -> 查看详情 -> 创建下载”做顺。

建议拆分：

```text
features/search/
  SearchView.tsx
  SearchControls.tsx
  AggregateSourcePicker.tsx
  SearchResults.tsx
  ComicCard.tsx
  ComicDetailsPanel.tsx
  ChapterSelector.tsx
  DownloadActions.tsx
  ChapterPreview.tsx
```

桌面布局：

```text
┌───────────────────────────────────────────────┐
│ SearchControls                                │
├────────────────────────────┬──────────────────┤
│ SearchResults              │ ComicDetails     │
│                            │ sticky           │
├────────────────────────────┴──────────────────┤
│ ChapterPreview, secondary                      │
└───────────────────────────────────────────────┘
```

移动布局：

```text
┌──────────────────────────────┐
│ SearchControls               │
│ Aggregate Source Picker      │
│ SearchResults                │
│ ComicDetails, after selected │
│ ChapterPreview, optional     │
└──────────────────────────────┘
```

具体改造：

- 搜索模式选择改为明显的 segmented control 或紧凑 select。
- 单源搜索时显示源选择。
- 聚合搜索时显示聚合源选择。
- 聚合源选择默认折叠，只展示已选数量。
- 搜索结果卡片弱化描述长文本，避免卡片高度过分不一致。
- 漫画卡片主操作为“详情”。
- 下载入口作为次操作，但在详情面板中强化。
- 详情面板突出标题、源、漫画 ID、简介、章节选择、下载动作。
- 章节选择支持全选、清空、反选、单章勾选。
- 下载动作包括下载首章、下载所选章节、下载全本。
- 章节图片区域改为 `ChapterPreview`。
- `ChapterPreview` 默认不抢主视觉。
- 文案全部从“阅读”改为“预览”。

文案调整：

```text
阅读器 -> 章节预览
开始阅读 -> 预览章节
打开章节后显示图片 -> 加载章节图片用于确认内容和源可用性
移动端为单列长条模式 -> 移动端按单列显示预览图片
```

函数命名也应在本次大重构中调整，不需要保留旧语义：

```text
readEpisode -> previewEpisode
onReadEpisode -> onPreviewEpisode
images -> previewImages
reader -> chapter-preview
```

验收标准：

- 搜索、聚合搜索结果正常。
- 打开详情正常。
- 章节选择正常。
- 创建下载任务正常。
- 章节预览仍可加载图片。
- 页面不再表达“完整阅读器”。

## 阶段 4：下载页重构

目标：下载页变成任务中心。

建议拆分：

```text
features/downloads/
  DownloadsView.tsx
  DownloadSummary.tsx
  DownloadTaskCard.tsx
  DownloadTaskActions.tsx
  DownloadItemsList.tsx
  CachePanel.tsx
```

页面结构：

```text
┌──────────────────────────────────────────────┐
│ DownloadSummary                              │
├──────────────────────────────────────────────┤
│ CachePanel                                   │
├──────────────────────────────────────────────┤
│ Filters                                      │
├──────────────────────────────────────────────┤
│ DownloadTaskList                             │
└──────────────────────────────────────────────┘
```

优化点：

- 顶部显示下载任务概览。
- 任务按状态分组或使用状态 badge。
- 每个任务卡片展示标题、源、漫画 ID、状态、进度、成功/失败数量、操作区。
- 失败项筛选更加明显。
- 失败项展开后可以重试单项。
- 删除任务、删除文件使用危险按钮。
- CBZ 导出使用独立强调样式。
- 缓存清理、缓存裁剪放到单独区域，不混在任务操作里。

验收标准：

- 下载任务实时更新仍正常。
- 展开下载项正常。
- 重试失败项正常。
- 取消、重跑、导出、删除正常。
- 缓存清理正常。
- 危险操作不容易误点。

## 阶段 5：源管理页重构

目标：让源管理更清晰，降低误操作。

建议拆分：

```text
features/sources/
  SourcesView.tsx
  SourceRepositoryPanel.tsx
  InstalledSourcesList.tsx
  SourceSettingsPanel.tsx
  CookieImportPanel.tsx
```

页面结构：

```text
┌──────────────────────────────────────────────┐
│ Repository / Install                         │
├───────────────────────┬──────────────────────┤
│ Installed Sources     │ Source Settings      │
├───────────────────────┴──────────────────────┤
│ Cookie Import                                │
└──────────────────────────────────────────────┘
```

优化点：

- 仓库源和已安装源分开。
- 安装源选择和安装按钮更清楚。
- 刷新仓库、重载源作为工具栏动作。
- 已安装源列表显示名称、key、是否启用、是否支持搜索、是否有设置。
- 源设置 JSON 编辑区域要更稳，保存前 JSON parse 错误给局部提示。
- 重置设置作为危险或警告操作。
- Cookie 导入区域和清空 Cookie 区域分开。
- 清空 Cookie 明确标记为危险操作。

验收标准：

- 安装源正常。
- 刷新仓库正常。
- 重载源正常。
- 启用/禁用源正常。
- 加载、保存、重置源设置正常。
- Cookie 导入和清空正常。

## 阶段 6：历史页重构

目标：历史页作为最近记录，不作为阅读中心。

建议拆分：

```text
features/history/
  HistoryView.tsx
  HistoryItemCard.tsx
```

定位：

```text
最近记录 / 最近查看
```

不要使用：

```text
继续阅读
阅读进度
```

建议操作：

- 查看详情。
- 预览上次章节。
- 可选创建下载，前提是当前数据足够稳定。

如果保留现有打开历史逻辑：

```ts
openHistoryItem(item, "details")
openHistoryItem(item, "read")
```

UI 文案改成：

```text
查看详情
预览章节
```

不要叫：

```text
继续阅读
```

验收标准：

- 历史列表正常展示。
- 打开详情正常。
- 预览章节正常。
- 空历史时引导去搜索。

## 阶段 7：状态管理与交互反馈

目标：解决全局 `busy` 粒度过粗的问题。

本项目未上线，可以直接拆分状态，不需要保留全局 `busy` 作为长期结构。

建议状态：

```ts
const [refreshing, setRefreshing] = useState(false);
const [searching, setSearching] = useState(false);
const [loadingDetails, setLoadingDetails] = useState(false);
const [previewingChapter, setPreviewingChapter] = useState(false);
const [creatingDownload, setCreatingDownload] = useState(false);
const [loadingDownloads, setLoadingDownloads] = useState(false);
```

要求：

- 用户能知道当前哪个操作在执行。
- 一个局部操作不应阻塞整页所有无关按钮。
- API 错误不能被吞掉。
- JSON 错误不能只显示在全局顶部。
- 下载创建状态显示在下载动作附近。

## 阶段 8：组件化与代码清理

目标：降低后续维护成本。

优先拆分顺序：

- `ComicCard`
- `SearchControls`
- `ComicDetailsPanel`
- `ChapterSelector`
- `ChapterPreview`
- `DownloadTaskCard`
- `SourceSettingsPanel`
- `HistoryItemCard`

后续可进一步拆出 hooks：

```text
hooks/
  useSources.ts
  useSearch.ts
  useDownloads.ts
  useHistory.ts
```

是否拆 hooks 取决于 `App.tsx` 在 UI 拆分后的复杂度。如果状态编排仍然过大，应继续拆，不保留大文件作为临时折中。

## 阶段 9：响应式设计

目标：桌面高效，移动可用。

桌面端：

- 宽屏下使用两栏或三栏布局。
- 详情面板 sticky。
- 下载任务列表信息密度高。
- 源管理支持左右分栏。

移动端：

- 不横向滚动。
- 表单控件全宽。
- 结果卡片可两列或单列，最小宽度稳定。
- 详情面板下沉到结果后方。
- 章节选择不要撑爆屏幕。
- 预览图片全宽。
- 底部导航或可横滑 tabs。

断点建议：

```css
@media (max-width: 960px) {}
@media (max-width: 640px) {}
```

验收标准：

- iPhone 宽度下不溢出。
- 平板下布局不拥挤。
- 桌面宽屏下不显得松散。
- 导航、表单、卡片、任务操作都可点。

## 阶段 10：验证与回归

每个阶段完成后运行：

```bash
pnpm typecheck
pnpm test
pnpm build
```

如果从仓库根目录运行，优先尝试：

```bash
pnpm --filter @venera/web typecheck
pnpm --filter @venera/web test
pnpm --filter @venera/web build
```

重点回归：

- 健康检查。
- Token 保存。
- 刷新源列表。
- 单源搜索。
- 聚合搜索。
- 搜索结果分页。
- 打开漫画详情。
- 章节选择。
- 章节预览。
- 创建下载。
- 下载任务实时更新。
- 下载项展开。
- 下载失败项重试。
- CBZ 导出。
- 删除下载任务。
- 缓存清理。
- 安装源。
- 启用/禁用源。
- 源设置保存/重置。
- Cookie 导入/清空。
- 历史详情打开。
- 历史章节预览。

## 推荐实施顺序

第一批：打基础。

- 样式 token 和基础视觉重构。
- `AppShell` 抽离。
- 顶层导航重构。
- 全局错误、状态 badge、危险按钮样式统一。

第二批：重构核心搜索。

- 拆 `SearchControls`。
- 拆 `SearchResults` 和 `ComicCard`。
- 拆 `ComicDetailsPanel`。
- 拆 `ChapterSelector`。
- 把“阅读器”改成 `ChapterPreview`。
- 强化下载动作。

第三批：重构下载中心。

- 下载概览。
- 下载任务卡片。
- 下载操作区。
- 失败项列表。
- 缓存面板。

第四批：重构源管理。

- 仓库安装面板。
- 已安装源列表。
- 源设置面板。
- Cookie 面板。
- JSON 错误局部化。

第五批：重构历史。

- 历史卡片。
- 文案从阅读导向改为记录导向。
- 保留详情和预览入口。

第六批：细化状态。

- 拆分 `busy`。
- 局部 loading。
- 局部错误。
- 操作反馈。

## 第一轮建议范围

第一轮可以大改，但必须形成完整闭环：

- 抽 `AppShell`。
- 重构样式系统。
- 重构 `SearchView` 布局。
- 将“阅读器”全部改成“章节预览”。
- 创建 `ChapterPreview` 组件。
- 强化下载按钮和详情面板。
- 拆掉明显不合理的大块 UI 结构。
- 跑 `typecheck`、`test`、`build`。

第一轮不要做：

- 不引入路由库，除非有明确页面级路由需求。
- 不引入 UI 组件库，除非现有 CSS 已无法满足。
- 不做完整阅读器。
- 不做新功能扩张。
- 不保留仅用于过渡的临时组件或兼容层。

## 成功标准

- 用户打开 Web 后明确感知这是一个正式的 Venera Web 控制台。
- 主路径清晰：搜索漫画、确认详情、选择章节、创建下载。
- 章节图片只是预览，不再像阅读器。
- 下载中心能清楚处理任务、失败项、导出和删除。
- 源管理页面足够清晰，设置和 Cookie 操作不混乱。
- 移动端可用，桌面端高效。
- 代码结构支持继续迭代，而不是继续堆在 `App.tsx` 和单个 `styles.css` 里。
- 回归验证通过。
