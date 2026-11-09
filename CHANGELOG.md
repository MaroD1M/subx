# Changelog

## Unreleased

### Added

- 任务创建增加幂等去重：同文件、媒体库、目标语言、输出模式和字幕格式已有运行中任务时，直接复用原任务，避免重复调用模型。
- 重试接口拒绝重试仍在运行的原任务。
- API 增加 16 MiB 请求体上限，防止超大 JSON/表单请求耗尽内存。
- 文件树恢复展开目录时按层级并发加载，减少深层目录串行请求等待。
- 文件树搜索增加 200ms 防抖，搜索时自动展开已加载的命中目录。
- 文件树目录已选数量改为一次计算并下传，避免每个目录重复扫描全部已选文件。
- 核对页把统计、待保存、已选和内容标记合并为单次遍历分析，筛选直接复用分析结果，减少长字幕输入时的重复计算。
- 任务创建、审核重译、模型列表、通知测试和集成 Webhook 增加按 IP 的轻量限速。
- 启动恢复任务拆分独立错误处理，并每 5 分钟回收卡住任务和 processing 通知投递。
- 新增任务日志、任务响应分块和集成事件去重索引，改善历史任务、日志和 Webhook 查询。
- 任务响应原始 prompt/response 仅会话或管理员 Token 可读，普通 `tasks:read` Token 只返回统计元数据。
- 历史回填通知使用稳定时间桶和内容摘要去重，避免重复提醒。
- `/api/health?deep=1` 增加 ASR/OCR 依赖检查，便于本地 readiness 排障。

### Tests

- 新增任务去重键和运行状态判断测试。
- 新增进程内限速窗口测试。
- 补充核对筛选、同文/超长/拉丁文本和搜索逻辑测试。
- 新增 FileNodeItem 组件测试，覆盖目录半选/全选、搜索自动展开和预计算选中数量。
- 新增通知失败重试测试，覆盖失败后回到 pending、达到最大次数后标记 failed，以及 processing 卡住恢复。
- 新增 ReviewEntryCard 组件测试，覆盖状态/质量标签、最终文本编辑和使用原文事件。
- 新增 SettingsStoragePanel 组件测试，覆盖存储统计渲染和清理确认弹窗。
- 引入 Vue Test Utils + happy-dom，新增任务日志面板组件测试，`npm test` 现在同时运行后端与组件测试。
- 新增 `npm run test:api`，用 Nuxt Test Utils 启动真实服务，覆盖健康检查、OpenAPI、认证登录/登出、配置校验与密钥保留、API Token scope/审计/撤销、任务创建、下载、重试、取消、幂等复用、OCR 原始字幕下载、核对导出、文件创建/重命名/删除、监控目录、存储接口、通知渠道、通知实际发送、Webhook Token 校验、真实 Webhook 回调入队与去重、路径映射失败记录、任务失败与单条历史删除、SSE 建连与取消事件、请求体上限、接口限速和路径穿越拦截。

## v2.8.4 - 2026-11-08

### Added

- AI 校对结果按任务和校对类型持久化缓存，重新进入页面、误点或重复打开不会再次调用模型；字幕内容变化后会提示缓存过期。
- AI 一致性问题支持定位、只看问题字幕、按问题类型筛选、选中问题字幕和批量重译。
- 一致性检查同时返回「统一译法建议」，术语可关联字幕编号并直接定位。
- 术语提取建议与一致性建议跨缓存去重，批量加入时提示新增、覆盖和已存在数量。
- 核对页新增「AI 问题」筛选与字幕标记，可与未翻译、低质量、待保存等筛选组合。
- 翻译上下文由前 4 条 + 后 4 条调整为前 6 条 + 后 6 条，让模型获得更完整的对话语气和剧情衔接。
- 翻译历史新增每页 20 / 50 / 100 条切换、页码导航和行悬浮高亮。
- 媒体库管理页改为左侧列表 + 右侧编辑器的工作台布局，新增配置校验、未保存提示、默认库自动维护和保存后停留。
- 媒体库列表新增名称/路径搜索和启用、停用、异常、监控中筛选，适配大量媒体库场景。
- 侧边栏和移动端导航恢复交互时预取，并抽离共享导航逻辑；新增页面切换加载进度条。
- 翻译历史诊断总览改为展开时按需加载；GitHub 版本检查改为空闲执行并缓存 6 小时。
- 配置和监控目录接口改为全站共享缓存，页面切换不再重复请求；数据写入后自动失效或刷新。
- 认证初始化合并为单次 `/api/auth/session` 请求，保留原 status / verify 接口兼容调用。
- 数据库兼容改动迁移到版本化 migration 机制，并补齐 PostgreSQL `translation_mode` 字段，降低 SQLite / PostgreSQL schema 漂移风险。
- 核对页拆分 `ReviewEntryCard`、`ReviewGuideModal` 和共享字幕标签/状态字典，减少单文件复杂度。
- 新增 `docs/maintenance.md`，说明目录职责、共享缓存、数据库 migration 和发版检查流程。
- 新增结构化服务端日志与统一 API 错误辅助函数，自动脱敏常见密钥字段，并记录未捕获接口错误。
- `server/api` 下 API 错误已统一迁移到 `apiError()`，当前路由中不再直接使用 `createError()`。
- 提取 SQLite 基线 schema，并新增 SQLite / PostgreSQL 表与字段一致性测试，防止 schema 漂移。
- 通知渠道发送逻辑拆分为独立 transport 模块，任务分块风险分析、核对记录写入和重试扩展逻辑拆到 `taskSupport.ts`，降低核心任务文件复杂度。
- 字幕格式占位符和 ASS 文本处理拆到 `subtitleFormatting.ts`；任务队列与取消状态拆到 `taskQueue.ts` / `taskState.ts`，继续降低核心文件复杂度。
- 任务导出、质量校验和核对写入拆到 `taskFinalize.ts`，源字幕准备（自动识别、OCR、ASR、内嵌/外挂字幕）拆到 `taskSource.ts`，任务日志写入统一到 `taskLog.ts`。
- 翻译执行、滚动上下文、缓存复用、分块重试和进度更新拆到 `taskTranslate.ts`，`task.ts` 精简为任务生命周期编排。
- 加固任务输出路径校验，限制目标语言/字幕格式字符并确保输出位于媒体库内；审核导出补参数校验和统一状态机。
- 修复 ASR 音频租约泄漏、空字幕被标记成功、部分翻译全回退后仍显示完成等问题；全回退超过阈值会进入核对。
- 修复任务入队失败留下永久排队任务、队列最终失败不同步任务状态、终态并发覆盖和审核记录非事务写入。
- 修复 OCR 原始字幕下载走错分支、API Token 可自我提权、使用已保存 AI Key 时可被指定任意地址。
- 修复设置页主 API Key 无法保存、未保存配置污染共享缓存、文件轨道请求串台、核对页保存覆盖输入和选择状态误判未保存。
- 修复历史页重复请求、任务页 SSE 断线后状态不更新、取消状态文案缺失、媒体库停用误删监控配置、自动化操作失败无提示。
- 统一 OpenAPI 实际路由为 `/api/openapi.json`，为 PostgreSQL 测试增加数据保护开关，为迁移增加事务和 advisory lock。
- PostgreSQL 同步桥支持事务连接亲和性，避免 BEGIN/COMMIT 落到不同连接；增加 statement/idle transaction 超时。
- 任务输出增加跨进程文件锁，避免并发任务覆盖同一字幕文件。
- CI 增加 Docker 镜像构建与健康检查，发布镜像前强制运行 lint/typecheck/test/build。
- E2E 支持生产 `.output` 启动，CI 改为生产构建模式运行；补充校验、Token scope、输出锁测试。
- 前端继续拆分：自动化页 API Token 面板、设置页存储面板、任务页日志面板拆为独立组件，降低大文件复杂度。
- 媒体库管理改为响应式卡片网格，点击卡片在弹窗中编辑，避免媒体库较多时侧栏长列表滚动。
- 媒体库卡片支持直接拖动排序，触屏和键盘仍可使用设置弹窗中的上移/下移按钮；新增拖拽排序 E2E 测试。
- 新增版本号一致性检查、Dependabot 依赖更新配置和 CI 覆盖率门槛/报告。

### Changed

- 核对页重构为紧凑工具条：常用筛选常显，完整筛选和导出设置收进弹出层；AI 校对改为桌面右侧分页、移动端抽屉。
- 新增 `npm run preview:images` 统一生成 README 预览图，固定 1440×900 视口、稳定演示数据和预览模式样式，避免截图遮盖与错位。
- 媒体库保存不再自动跳回首页，并会清理已删除媒体库对应的自动监控配置；停用媒体库会保留监控配置。
- 统一媒体库与核对页的按钮尺寸、状态标记、空状态和帮助说明。

### Fixed

- 修复核对页缓存结果无法复用、AI 问题无法批量操作的问题。
- 修复截图被 Playwright device 配置覆盖为 1280px、sticky 操作栏在长截图中遮盖内容的问题。
- 优化核对页搜索防抖、统计计算、预览请求竞态和右侧面板挂载。
- 优化媒体库保存检测复用、校验计算和重复检测。
- 优化 AI 校对缓存 GET：无缓存时不再加载全部字幕。
- 修复媒体库默认库、重复 ID、路径校验和自动监控开关的边界问题。
- 补全核对原因中「疑似错位/串行」的显示文案。

### Upgrade Notes

- 从 v2.8.3 升级无需调整卷、数据库或设置；建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。
- 修复输出路径穿越、API Token scope 提权、已保存 AI Key 外送和通知出站云元数据访问风险。
- 修复 ASR 租约泄漏、队列孤儿、任务终态覆盖、审核事务、空字幕/全回退误判和并发输出覆盖。
- 拆分部署时请同步升级主应用、ASR 和 OCR 镜像到 v2.8.4。

## v2.8.3 - 2026-11-05

### Fixed

- 统一服务端与前端时间显示：SQLite/ISO 时间戳按 UTC 解析后，再按 `TZ` 或 `NUXT_PUBLIC_TIME_ZONE` 输出；历史、任务详情、自动化、日志、诊断、API Token 和通知时间不再出现时区偏差。
- 任务日志与翻译请求日志使用配置时区写入，便于与界面时间对齐。
- 修复 Edge 在页面隐藏/恢复后可能因后台导航导致最小化窗口自动恢复的问题；守护仅对 Edge 生效，并带 20 秒重载保护。

### Changed

- 新增 `NUXT_PUBLIC_TIME_ZONE`，未设置时回退到 `TZ`，再回退到 `Asia/Shanghai`；docker-compose、entrypoint 和 all-in-one 启动脚本已同步。
- 侧边栏和移动端导航改为响应式当前路由，并关闭导航项预取，减少客户端跳转副作用。

### Tests

- 新增时区解析、格式化、默认时区回退的单元测试。
- 新增客户端导航更新当前导航项和页面内容的 E2E 回归。

### Upgrade Notes

- 从 v2.8.2 升级无需调整卷、数据库或设置。
- 如需与容器时区不同的显示时区，设置 `NUXT_PUBLIC_TIME_ZONE`；否则沿用 `TZ`。
- 拆分部署时请同步升级主应用、ASR 和 OCR 镜像到 v2.8.3。
- 建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。

## v2.8.2 - 2026-11-03

### Fixed

- 「仅原文字幕」任务现在也会写入核对记录，进入字幕核对页可以查看、编辑和导出原始字幕。
- 没有核对记录的旧任务会优先回填 `output_path` 已导出的字幕，再回退到外挂字幕源文件。
- 翻译历史页仅对存在核对数据或可回填字幕的任务显示「核对」入口，避免进入空白页面。
- 核对页区分「任务没有核对数据」和「当前筛选无匹配条目」，后者提供重置筛选按钮。
- 核对页对「仅原文字幕」任务显示说明，提示批量重译/AI 校对会调用翻译模型。
- 规避 Windows Edge 在页面隐藏时因 Vue Router 写入滚动位置而自动恢复最小化窗口的问题；补丁仅对 Edge 生效，不影响正常路由和 Chrome/Firefox 滚动恢复。Edge 普通标签切换时可能少保存一次滚动位置。
- 核对回填按来源区分：仅原文字幕任务优先使用导出字幕；翻译任务优先使用外挂字幕源，避免把译文当成原文。
- 运行中的任务不再显示“核对”入口；核对回填仅对终止状态任务执行，并清理失败回填的半成品记录。
- 仅原文字幕任务的核对记录改为导出成功后写入，写入失败不再影响任务完成。
- 核对页加载失败会显示错误状态和重试按钮，不再误报为“没有核对数据”。
- OCR 服务新增并发任务上限，避免多个长任务同时耗尽 CPU、内存和临时磁盘。
- OCR 客户端在轮询异常时会取消远端任务；OCR 分段缓存增加结果指纹、任务锁和算法版本，避免错误复用。
- PGS 稀疏字幕校验、语言回退、过滤重试和取消处理已修正；空白帧后的重复字幕不再丢失。
- OCR 子进程增加超时、取消和进程组终止，FFprobe 不再可能无限挂起。
- OCR 断点清理会尊重断点保留时间；OCR 超时配置为非法数字时回退默认值。
- 核对页移动端隐藏重复预览、取消嵌套滚动；文件树移动端限制高度，分栏器支持键盘调整，目录树改为 roving tabindex。
- 历史页补齐图标按钮可访问名称和桌面空状态；路由切换后焦点会移动到主内容区。
- Edge history guard 使用全局标记，避免 HMR 重复包装。

### Tests

- 新增仅原文字幕任务生成核对记录、历史页 `reviewAvailable` 和输出字幕回填的 E2E 回归。
- 新增 Edge history guard 单测，覆盖隐藏滚动写入、正常路由 replaceState、非 Edge 浏览器和重复安装。
- 补充 OCR timeout 非法数值、PGS 命名/flags、分段合并和日志分类回归。

### Upgrade Notes

- 从 v2.8.1 升级无需调整卷、数据库或设置。
- OCR 新增 `OCR_MAX_CONCURRENT_JOBS`，默认 `2`；低配 NAS 建议设为 `1`。
- 拆分部署时请同步升级主应用与 OCR 镜像到 v2.8.2。
- 建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。

## v2.8.1 - 2026-11-03

### Fixed

- 修复 PGS 直通 pgsrip 被语言/flags 过滤的问题：提取的 `.sup` 文件名现在携带轨道语言和 forced/full 标记，语言代码不匹配时会自动去掉 `-l` 重试。
- 修复 OCR 成功回退后日志仍显示红色“错误”的问题：`pgsError` 等 JSON 字段不再触发错误分类，OCR 诊断日志显式归入系统分类。
- PGS 诊断日志补充实际语言、`.sup` 文件名和 forced/full 标记。

### Tests

- 新增 PGS `.sup` 命名、forced/full 选择、日志分类回归测试。

### Upgrade Notes

- 从 v2.8.0 升级无需调整卷、环境变量或数据库。
- 拆分部署时请同步升级主应用与 OCR 镜像到 v2.8.1；OCR 服务端命名逻辑不升级则 PGS 直通仍可能失败。
- 建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。

## v2.8.0 - 2026-11-03

### Added

- 设置页「图像字幕 OCR → 长视频与超时」新增最大 OCR 时长、分段时长、PGS 识别超时、单段抽帧超时、单段重试、断点保留、无进度超时和总任务上限，全部提供默认值并随任务下发。
- PGS 长电影不再被位图抽帧时长限制误拦，直接走 pgsrip；失败或结果异常时回退到分段图像 OCR。
- VobSub / DVD 长视频按分段处理，每段完成立即清理帧文件；失败重试可复用已完成分段。
- OCR 服务健康检查返回长视频参数，设置页可查看服务默认值和分段配置。

### Fixed

- 修复超过 2 小时的电影 OCR 被误报为“供应商服务异常”的问题；现在明确显示 OCR 时长限制，并提示调大设置页上限或改用语音识别。
- 修复 OCR 客户端固定 2 小时总超时问题，改为可配置的无进度超时和总任务上限。
- 修复长视频 OCR 失败重试时整片重新抽帧的问题。
- 修复 OCR 断点目录可能被存储清理过早删除的问题。

### Changed

- `OCR_MAX_SECONDS` 默认值从 7200 调整到 14400；新增 `OCR_CHUNK_SECONDS`、`OCR_PGSRIP_TIMEOUT_SECONDS`、`OCR_FFMPEG_TIMEOUT_SECONDS`、`OCR_CHUNK_RETRIES`、`OCR_RESUME_TTL_HOURS`、`OCR_JOB_IDLE_TIMEOUT_MS`、`OCR_JOB_ABSOLUTE_TIMEOUT_MS`。
- 环境变量继续作为默认值，设置页保存后以应用内参数为准。
- 文档补充长电影 OCR、分段断点、设置页参数和排障建议。

### Upgrade Notes

- 从 v2.7.0 升级无需调整卷或环境变量；新 OCR 参数有默认值，可在设置页调整。
- 拆分部署时请同步升级主应用与 OCR 镜像到 v2.8.0，旧版 OCR 服务不支持新的分段与超时参数。
- 本次不需要数据库迁移；旧任务和已有配置保持兼容。
- 建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。

## v2.7.0 - 2026-11-03

### Added

- 首页批量模式支持目录三态勾选和递归扫描，只加入视频文件；与视频同名的外挂字幕由视频自动匹配，不单独入队。
- 批量任务支持同集多版本去重、字幕/音轨语言优先、默认轨优先、强制轨开关和 ASR 回退策略；选轨策略会随任务保存。
- 新增 `GET /api/files/scan`，用于递归扫描目录内视频文件。

### Fixed

- OCR 空白帧判断改为字幕区域有效亮像素检测，修复普通白色字幕被整帧平均亮度误判为空白、后续大片漏识别的问题。
- 修正 FFmpeg `subtitles` 滤镜 `si` 参数：现在传“第几个字幕流”，不再误用全局 stream index。
- 字幕图像先裁剪字幕区域、放大、灰度化和 Otsu 二值化，提升小字号和 DVD 描边字幕识别率。
- PGS 的 pgsrip 结果会校验条数、文本量和时间覆盖；疑似不完整时自动回退到图像 OCR。
- OCR 低置信度结果不再静默丢弃，会保留置信度并进入核对页高亮。
- 请求 ASR / OCR 的 FFmpeg 抽帧改为按源分辨率渲染并保留字幕序号，改善 VobSub / DVD 轨道选择。
- OCR 任务日志新增诊断信息：帧数、空白帧、变化帧、OCR 调用数、空结果、回退原因。
- 修复 PGS/VobSub/DVD 位图字幕被 `subtitles` 文本滤镜处理导致 FFmpeg 直接失败的问题，改为位图字幕 overlay 到黑底后抽帧。
- FFmpeg 和 pgsrip 失败时保留 stderr 摘要，任务错误不再只有 `exit status 1`。
- 修复长音频 ASR 任务被固定 60 分钟总超时误杀的问题：改为“无进度超时 + 6 小时绝对上限”，并在超时时取消远端任务。
- ASR 音频上传改为文件 Blob 懒读取，降低长音频一次性读入 Node 内存的压力。
- 修复 Emby / Bazarr Webhook 被接口白名单拒绝的问题。
- 修复 PostgreSQL 下 `datetime('now', '+7 days')` 未翻译导致 Session 写入失败的问题。
- 修复外部集成事件在任务极快完成时可能永远停留在 queued 的竞态。
- 文件删除/重命名增加媒体库根目录保护；无效重试任务返回 404 而不是 500。

### Changed

- 设置页新增独立「图像字幕 OCR」一级入口，不再放在「语音识别」页内。
- OCR 设置新增引擎选择（自动 / RapidOCR / Tesseract）和低置信度提示阈值。
- 新增 `GET /api/ocr/status` 服务检测接口。
- 前端统一设计系统：页面宽度、页头、卡片圆角/阴影、状态标签、子导航和底部操作栏。
- 桌面导航补齐「设置」一级入口，与移动端保持一致；品牌 Logo 换成统一 SVG 资产。
- 替换网页 favicon，新增 SVG 图标和 Apple Touch Icon，确保浏览器标签页显示新 Logo。
- 首页右侧改为「字幕与轨道 / 翻译设置」双 Tab，操作按钮固定在底部。
- 历史状态、自动化投递与集成事件统一为中文状态标签。
- 字幕核对导出设置从页头移动到独立工具条，任务详情改用统一页头。
- 新增「设置 → 存储与缓存」：显示磁盘和缓存占用，支持按类型清理 ASR 音频、OCR 临时图像、任务临时文件、AI 日志、任务日志和翻译缓存。
- 新增 `GET /api/storage` 和 `POST /api/storage/cleanup`，清理会跳过最近 5 分钟仍在使用的文件。
- 桌面端改为可折叠左侧导航，移动端保留底部导航；版本、主题、GitHub 和登录入口收进侧栏。
- 设置和自动化二级导航统一为横向 Tab，去掉重复的左侧子导航。
- 更新全站预览图和任务/历史/核对页壳层，统一侧栏、页头和内容宽度。
- 修复 768–1279px 平板宽度下侧栏和底部导航同时缺失的问题；统一到 1280px 断点。
- 修复移动端底部保存栏被底部导航遮挡的问题，并增加安全区偏移。
- 任务详情和字幕核对会正确高亮「翻译历史」导航；移动端切换「翻译设置」会同步右侧面板。
- 缓存清理会跳过正在使用的 ASR 音频、任务临时文件和活跃 OCR 临时目录，避免长任务被清理打断。
- ASR 仅保存结果摘要和有限词级数据，避免长音频把数据库和 PostgreSQL 同步桥缓冲区撑爆。
- 未知媒体库 ID 不再静默回退默认库，改为明确报错。
- 删除确认统一为应用内弹窗，替换浏览器原生 `confirm`；新增深色首页视觉回归和页面过渡。
- OCR 抽帧临时目录从系统 `/tmp` 迁移到 `temp/ocr`，与 ASR 音频、AI 日志等缓存统一；存储页仍兼容扫描并清理旧 `/tmp` 残留。
- OCR 位图字幕抽帧改用 `scale2ref` 按源字幕尺寸缩放，修复 2160p 视频只识别到少量错位字幕的问题。
- 自动字幕选择优先默认/非强制轨道；界面和 OCR 诊断显示 `[强制]`、`[默认]` 与轨道语言/标题。
- pgsrip 未生成 SRT 时会附带 stdout/stderr 摘要，便于定位模型、语言或轨道路径问题。
- OCR 在长视频只产出极少量字幕时不再静默标记完成，会明确提示可能选错强制轨或字幕未渲染。
- 左侧导航字号提升到 15px、行高和点击区域加大，选中项增加主色指示条；文件树行高和路径字号同步优化。
- 字幕翻译跨块上下文调整为前 4 条 + 后 4 条：前文帮助承接，后文只作预看不翻译；核对页重译同步生效。
- 翻译缓存指纹加入前后文，避免不同语境复用同一句旧译文。
- 任务通知补充输出模式、字幕格式、双语排版、字幕来源、目标语言、模型、翻译风格、任务来源、耗时和输出路径。
- 历史列表和任务详情显示仅译文 / 双语 / 仅原文字幕，长模型名不再挤压其他字段；移动端历史卡片同步补充输出信息。
- 自动化监控目录弹窗加宽，包含/排除正则增加说明、常用示例和可点击模板。
- 清理过期的开发 TODO、自动化技术方案、技术交接文档和归档设计稿；文档收敛为使用、部署、测试、ASR 基准、PostgreSQL 运行时和 CHANGELOG。
- 版本号更新到 v2.7.0，README、Docker Compose、部署文档、使用文档和 OpenAPI 版本同步。

### Upgrade Notes

- 数据库会自动新增 `track_policy_json` 字段，无需手动迁移；旧任务没有策略时继续使用原来的自动选轨逻辑。
- 批量目录扫描默认只加入视频文件；同名外挂字幕由视频自动匹配，不会单独重复入队。
- 从 v2.6.2 升级无需调整卷或环境变量，重新拉取镜像即可；建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。

## v2.6.2 - 2026-11-02

### Added

- ASR 新增任务式接口与真实进度上报：模型加载、转写、整理结果分阶段显示，页面不再长时间停在固定百分比。
- 任务详情新增“当前阶段进度”条和实时阶段说明，历史列表也会显示当前处理阶段。
- 提取出的 ASR 音频按媒体文件/音轨缓存，任务失败或重试时直接复用，不再重复运行 ffmpeg。

### Fixed

- ASR 请求使用放宽到 60 分钟的 undici 超时，修复长音频转写被 Node 默认 300 秒 `UND_ERR_HEADERS_TIMEOUT` 中断的问题。
- ASR 服务把模型推理移出事件循环，并改为后台线程执行，识别期间 `/health` 和模型状态查询不再被阻塞。
- 任务失败后保留音频缓存；成功任务按“保留音频”设置决定是否清理，缓存默认保留 14 天。
- 修复首页关闭「语音识别」开关后卡片被固定高度预览区裁切消失的问题；视频、字幕轨和音频轨选择会保留。
- 没有可用文本/图像字幕源时禁用「加入队列」「开始翻译」按钮，并提示关闭 ASR 后无法创建任务。
- 更新 README、部署文档、ASR README 和界面预览图，补充音频缓存位置与保留策略。

## v2.6.1 - 2026-11-01

### Added

- 登录页「获取帮助」改为内置帮助弹窗，包含忘记口令、HTTPS 提示、文档和问题反馈入口。
- 通知渠道增加「测试代理」，可检测渠道代理或容器 `HTTPS_PROXY` / `HTTP_PROXY` 的连通性。
- 文档补充忘记口令重置步骤和 Telegram / 通知代理排障说明。

### Fixed

- Telegram 等 HTTP 通知改用 undici 的 fetch，修复代理 dispatcher 与 Node 全局 fetch 不兼容导致 `fetch failed` 的问题。
- 通知出站会按“渠道代理 → `HTTPS_PROXY` → `HTTP_PROXY` → `ALL_PROXY`”回退，并输出底层网络错误原因。
- 口令长度统一为 8 位，修复登录页提示 4 位、后端要求 8 位、文档写 4 位的三方不一致。
- 已登录用户访问 `/login` 会自动跳回首页，不再看到登录表单。
- 退出接口失败时会清理前端状态并回到登录页，不再卡在“看起来还登录着”的状态。
- 登录页移除“解 锁”空格、闪烁警告等生硬细节，区分局域网和公网 HTTP 提示。
- ASR 连接失败时自动重试 3 次，并在单镜像中尝试内置 `127.0.0.1:8000` 兜底；错误会显示实际尝试的地址和底层原因。
- 单镜像启动时等待 ASR/OCR `/health` 就绪后再启动 Web，避免首个任务撞上服务初始化。
- 单镜像健康检查启动宽限期从 45/60 秒放宽到 120 秒，适配低配 NAS 冷启动。

## v2.6.0 - 2026-11-01

### Added

- 有文本字幕的视频也可以手动打开「语音识别」开关，忽略现有字幕并重新听写。
- 选择 ASR 时会明确提示“已切换为语音识别”，字幕轨道选择自动置灰，避免误操作。
- 新增有字幕强制 ASR 的 E2E 回归测试。

### Fixed

- ASR 设置页的「运行设备」和「计算精度」现在会随请求传给 ASR 服务，不再只改 UI 不生效。
- 设置页保存后清理 Nuxt 配置缓存，返回首页立即使用新的 ASR/OCR 开关和地址。
- 单镜像旧 sidecar 地址改为一次性迁移；迁移后以设置页保存的值为准，不会被反复改写。
- 修复选择有字幕视频时 ASR 入口被隐藏的问题。

### Changed

- README、部署文档、使用文档、ASR/OCR README 补充有字幕强制 ASR 的说明。
- 文档继续补齐 Compose 逐项注释、环境变量表和“说人话”的部署提示。
- 版本更新到 v2.6.0。

### Upgrade Notes

- 旧 sidecar 地址只会自动迁移一次；如果迁移后仍要连接外部 sidecar，请在设置页重新填写。
- 设置页保存后不需要重启容器，返回首页即可生效。
- 有字幕的视频默认仍优先使用字幕；想重新听写时手动打开「语音识别」开关。

## v2.5.0 - 2026-11-01

### Added

- 单镜像 all-in-one：主应用、ASR、OCR 合并进 `ghcr.io/marod1m/subx`，默认只启动一个容器。
- ASR 模型下载管理器：进度、速度、剩余时间、暂停、续传、取消、重试、卸载。
- 模型下载代理：设置页临时代理 + `ASR_DOWNLOAD_PROXY` 默认代理，仅支持 HTTP(S)。
- Hugging Face 镜像站：`ASR_HF_ENDPOINT` / `HF_ENDPOINT`。
- 下载任务持久化：容器重启后活动任务显示为已暂停，可继续下载。
- `scripts/pull-image.sh`：打印 Docker 原生拉取进度，Ctrl+C 暂停后重跑续传，支持代理提示。
- 设置页「本地模型管理」：按模型/引擎查看安装状态、磁盘占用和下载任务。
- 有字幕的视频也可以主动打开「语音识别」开关，忽略现有字幕并重新听写。
- 新增 `GET /api/asr/models`、暂停/继续/取消/卸载接口。
- 单镜像自动把旧 `http://subx-asr:8000` / `http://subx-ocr:8000` 迁移到 `127.0.0.1:8000` / `8001`；可用 `SUBX_KEEP_LEGACY_SIDECAR_URLS=true` 关闭迁移。
- OCR 零下载：Tesseract 语言包和 RapidOCR 直接内置。

### Changed

- 默认镜像从 Alpine 改为 Debian bookworm，以兼容 faster-whisper / ctranslate2 / OpenCV 等 Python 依赖。
- 运行时同时启动 Node 主应用、ASR 和 OCR；内部服务只监听 `127.0.0.1`。
- ASR 默认地址改为 `http://127.0.0.1:8000`，OCR 默认地址改为 `http://127.0.0.1:8001`。
- 单镜像默认 `ASR_AUTO_DOWNLOAD=false`，避免首次识别时静默下载模型。
- Compose 默认增加 `./data/models:/models` 并提高内存限制到 4GB。
- 独立 ASR/OCR sidecar、增强版和 GPU 版继续保留，作为拆分部署/特殊硬件选项。
- 镜像与文档版本更新到 v2.5.0。

### Docs

- `docker-compose.yml` 补齐端口、卷、环境变量、健康检查、资源限制、profiles 和可选服务的逐项注释。
- `docs/deployment.md` 将环境变量拆分为主镜像、ASR、OCR、数据库/多 Worker、内部/测试变量，并补齐默认值与适用范围。
- `.env.example` 补齐基础、内置 ASR/OCR、数据库、多 Worker 和高级调优变量。
- ASR / OCR README 增加完整环境变量表。
- 更正 v2.5.0 镜像体积：amd64 下载约 586 MiB、解压后约 1.57 GiB；arm64 下载约 520 MiB（不含模型）。

### Fixed

- ASR 设置页的「运行设备」和「计算精度」现在会随识别请求传给 ASR 服务，不再只改 UI 不生效。
- 单镜像旧 sidecar 地址改为一次性迁移；迁移后以设置页保存的 ASR/OCR 地址为准，不会被反复改写。
- 模型下载不再阻塞请求线程，任务状态可轮询。
- 模型下载失败、暂停、取消后保留部分文件并支持断点续传。
- 模型目录权限异常时可通过 `CHOWN_MODELS=true` 修复。

### Upgrade Notes

- 升级后主应用镜像已包含 ASR/OCR，不再需要 `--profile asr` / `--profile ocr`。
- 请新增 `./data/models:/models` 卷，并在设置页手动下载 Whisper 模型。
- 旧的 sidecar 默认地址会自动迁移；连接外部 sidecar 时设置 `SUBX_KEEP_LEGACY_SIDECAR_URLS=true`。
- 建议升级前备份 `./data/db`、`./data/models` 与 PostgreSQL 数据库。
- 旧 Session 会失效，需要重新登录。

## v2.4.1 - 2026-11-01

### Fixed

- 通知渠道 API 校验补齐 Discord / Matrix / 企业微信，修复新增渠道返回 400。
- 修复 ntfy 中文标题作为 HTTP Header 导致 ByteString 错误；中文标题改放正文。
- 修复自动化页 Webhook URL 服务端/客户端 hydration 不一致。
- 补充 CJK 字体栈，修复移动端 Chromium 中文显示为方块。
- 生产构建集成冒烟覆盖任务、外挂字幕、ASR/OCR、质量、AI 校对、自动监控、集成、通知和 API Token。

### Docs

- 新增 `docs/PROJECT_HANDOVER.md`：架构、版本规划、已完成、未完成、路线图、部署与维护约定。
- README 增加技术交接文档入口。
- TODO 明确以技术交接文档为当前状态来源。
- 旧设计稿、旧设计系统、诊断样例归档到 `docs/archive/`。

### Changed

- 为主要服务模块补充职责、边界和风险注释。
- 清理构建产物、测试临时文件、Python 缓存、NAS 缩略图目录和未使用工具目录。
- 镜像与文档版本更新到 v2.4.1。

## v2.4.0 - 2026-10-31

### Security

- 升级 Nuxt 4.6.3、@nuxt/ui 4.12、Vue 3.5.44、Zod 4.6.7、OpenAI 7.47、Nodemailer 10.3.1、Vitest 5.0.5。
- 生产依赖 critical/high 漏洞清零。
- 修复 `brace-expansion` high 传递依赖。
- 保留真实 PostgreSQL smoke CI。

### Changed

- Nuxt/UI/Vitest major 升级后的构建、类型检查、单测和 E2E 全量回归通过。
- Playwright 增加开发服务器健康检查重试，避免 Nuxt 启动期误判。
- 文档、镜像标签、OpenAPI 版本同步到 v2.4.0。

### Remaining

- Nuxt/Nitro/Vite 上游仍有 moderate/low 审计项，当前最新版本暂无修复。
- ESLint 相关 dev 依赖仍有 moderate 项。
- PostgreSQL 同步桥仍为低并发架构。
- VobSub/DVD OCR 仍为 PoC。

## v2.3.0 - 2026-10-31

### Added

- 真实 PostgreSQL smoke CI 工作流。
- v2.3 实测指南：ASR/OCR/PG/多 Worker/集成/性能记录模板。
- sidecar 可选鉴权：`ASR_API_KEY` / `OCR_API_KEY`。
- OpenAPI 补充质量、校对、音频、集成和 ASR 指标接口。

### Fixed

- PostgreSQL 桥接查询序号校验、超时重启 worker、idle client 错误处理。
- watch event / notification delivery 原子 claim。
- 通知 processing 卡住恢复。
- 自动来源优先使用外挂字幕。
- 核对页音频回放使用正确音轨。
- OCR 超过 `OCR_MAX_SECONDS` 明确报错。
- 质量阈值读取配置；手动编辑后清除旧评分。
- 任务删除清理 ASR/质量孤儿数据。
- 外部集成去重与任务状态回写。
- 集成 Token 保存后当前页面可复制真实 URL。
- API Token scope 与 OpenAPI 补齐。
- 新口令最小长度 8 位。

### Changed

- PG 文档明确同步桥阻塞和 `PG_POOL_SIZE` 串行限制。
- TODO/README/部署/使用文档同步到 v2.3.0。

### Upgrade Notes

- 设置 sidecar Token 时，设置页必须填写相同 Key。
- 未设置 `DATABASE_URL` 时继续 SQLite。
- PostgreSQL 实测仍建议低并发，高并发等待异步 DB 层。
- 建议升级前备份数据库。

## v2.2.0 - 2026-10-31

### Fixed

- PostgreSQL 同步桥增加查询序号校验，超时后自动重启 worker。
- PG worker 监听 idle client 错误，避免静默退出。
- watch event / notification delivery 改为原子 claim，避免多 Worker 重复。
- 通知投递增加 processing 卡住恢复。
- 自动来源在无内嵌字幕时优先使用同目录外挂字幕。
- 核对页音频回放使用任务实际音频轨。
- OCR 超过 `OCR_MAX_SECONDS` 时明确报错，不再静默截断。
- 质量阈值改为读取配置，手动编辑后清除旧质量评分。
- 任务删除与日志清理补齐 ASR/质量孤儿数据。
- 外部集成增加 10 分钟去重。
- API Token 增加集成事件/ASR 接口 scope 映射。
- 集成 Token 保存后当前页面仍可复制真实 Webhook URL。
- 新口令最小长度提高到 8 位。

### Added

- `ASR_API_KEY` / `OCR_API_KEY` 可选 sidecar 鉴权。
- OpenAPI 增加质量、校对、音频、集成和 ASR 指标接口。

### Changed

- PG 文档明确同步桥会阻塞事件循环且 `PG_POOL_SIZE` 受串行限制。
- TODO/文档同步修正通知渠道、OCR 语言数量和升级说明。

### Upgrade Notes

- 设置 sidecar Token 时，设置页必须填写相同 Key。
- 未设置 `DATABASE_URL` 时继续使用 SQLite。
- PostgreSQL 高并发仍建议等待异步 DB 层。
- 建议升级前备份数据库。

## v2.1.0 - 2026-10-31

### Added

- 可选 PostgreSQL 运行时：设置 `DATABASE_URL` 即启用。
- PostgreSQL schema 自动初始化。
- PostgreSQL worker + 共享内存同步桥，兼容现有同步 DB API。
- 多主机 Worker 原子抢占与陈旧任务回收。
- `PG_POOL_SIZE` 连接池配置。
- SQLite → PostgreSQL 数据迁移脚本。

### Changed

- `useDb()` 根据 `DATABASE_URL` 自动选择 PostgreSQL 或 SQLite。
- 任务启动恢复只回收 heartbeat 超时的陈旧任务。
- Docker 运行时包含 PostgreSQL worker、pg 依赖与 schema。
- 文档更新 PostgreSQL 部署与多主机 Worker。

### Fixed

- 修复多 Worker 启动时抢占活跃任务的问题。
- 修复 SQLite 专属 SQL 在 PostgreSQL 下的兼容问题。

### Upgrade Notes

- 未设置 `DATABASE_URL` 时继续使用 SQLite，无需迁移。
- 多主机建议启用 PostgreSQL，并先运行迁移脚本。
- 旧 Session 会失效，需要重新登录。
- 建议升级前备份 SQLite 与 PostgreSQL 数据库。

## v2.0.0 - 2026-10-31

### Added

- RapidOCR 支持：PGS 使用 pgsrip AutoEngine，中英抽帧 OCR 优先 RapidOCR。
- Emby / Bazarr Webhook 集成。
- AI 校对与术语学习：术语建议、一致性检查、一键加入术语表。
- 核对页质量筛选与长列表 `v-memo` 优化。
- PostgreSQL schema 与 SQLite → PostgreSQL 数据迁移脚本。
- `OCR_ENGINE` 配置（auto / rapidocr / tesseract）。

### Changed

- OCR 镜像安装 pgsrip RapidOCR extra 与 onnxruntime。
- 集成页面新增 Emby / Bazarr。
- 质量筛选支持低质量、高质量和未校验。
- PostgreSQL 文档明确运行时切换仍需异步 DB 层。

### Fixed

- 修复 OCR 长视频无进度、无取消的问题。
- 修复抽帧 OCR 对静态字幕帧重复识别的问题。
- 修复集成 Sonarr 相对路径优先级问题。

### Upgrade Notes

- 主应用与 OCR sidecar 建议同步升级到 v2.0.0。
- RapidOCR 会增加镜像体积；低配设备可设 `OCR_ENGINE=tesseract`。
- PostgreSQL 迁移工具只迁移数据，主应用当前仍默认 SQLite。
- 建议升级前备份 `./data/db`。

## v1.9.0 - 2026-10-31

### Added

- OCR 异步任务：创建、状态轮询、取消。
- OCR 任务进度接入 SubX 任务状态和日志。
- 抽帧图像哈希去重，静态字幕画面不重复 OCR。
- 并行 Tesseract OCR，默认 4 Worker。
- `OCR_FPS`、`OCR_WORKERS`、`OCR_MIN_CONFIDENCE` 配置。
- 抽帧 OCR 置信度写入核对页。

### Changed

- OCR 客户端优先使用异步任务接口，旧服务自动回退同步接口。
- VobSub/DVD 从 1fps 逐帧 OCR 升级为 2fps 哈希去重 + 并行识别。
- OCR 服务健康检查返回 FPS、Worker 和活动任务数。

### Fixed

- 修复长视频 OCR 请求容易超时、无进度的问题。
- 修复低置信度 OCR 噪声直接进入翻译的问题。

### Upgrade Notes

- 主应用与 OCR sidecar 都建议升级到 v1.9.0。
- 旧 OCR 服务仍兼容同步接口。
- 低配 NAS 可降低 `OCR_FPS` 和 `OCR_WORKERS`。

## v1.8.0 - 2026-10-31

### Added

- Sonarr / Radarr / Jellyfin / Plex Webhook 入站集成。
- 下载器路径到 SubX 媒体库路径映射。
- 外部集成事件记录与自动化页面「外部集成」Tab。
- Discord、Matrix、企业微信通知渠道。
- 自动化规则模板：电影、剧集、动画、低配 NAS、双语字幕。
- OCR 语言扩展到 24 种，抽帧 OCR 低置信度过滤和置信度写入。
- 多 Worker 支持：Worker ID、心跳和陈旧任务回收。
- PostgreSQL 迁移评估文档。

### Changed

- 任务启动恢复只回收陈旧运行任务，支持单主机多 Worker。
- 自动化页面新增模板快捷应用和集成配置。
- 通知渠道 UI 支持新渠道。

### Fixed

- 修复集成路径在 Windows 下载器路径下的映射。
- 修复 Sonarr 相对路径优先于 series 根路径的问题。
- 修复多 Worker 启动时抢占活跃任务的问题。

### Upgrade Notes

- 数据库自动迁移，新增 `integration_events` 表。
- 外部 Webhook 需要先生成集成 Token。
- 多 Worker 请使用本地 SQLite 卷，不要放 NFS/SMB。
- PostgreSQL 仍为评估项，默认数据库继续 SQLite。
- 建议升级前备份 `./data/db`。

## v1.7.0 - 2026-10-31

### Added

- 双模型质量校验：翻译后用第二模型逐条评分。
- 翻译质量评分写入核对条目，低于阈值自动进入核对。
- 质量运行表与质量条目表，记录模型、平均分、问题统计和错误。
- 核对页质量徽章与漏译/增译/误译/不自然/术语/格式等问题标签。
- 任务详情质量报告。
- 设置页质量校验开关、校验模型、阈值和最大条数。
- 说话人标签入库并在任务详情展示。
- 增强音频预处理与说话人分离失败自动回退。
- `asr-enhanced` Compose profile 与增强镜像 Dockerfile。

### Changed

- 低分译文新增 `low_quality_translation` 核对原因。
- 核对重译会清除旧质量评分，避免展示过期结果。
- 任务详情 ASR 页同时支持 OCR 任务。

### Fixed

- 修复核对条目写入质量字段时的参数数量问题。
- 修复 ASR 低置信度为 0 时被当作有效置信度的问题。
- 修复 OCR/ASR 任务状态筛选遗漏。

### Upgrade Notes

- 数据库自动迁移，新增质量运行/条目表与核对质量字段。
- 质量校验默认关闭；开启后会产生额外模型调用费用。
- 增强音频与说话人分离需要 `asr-enhanced` profile。
- 建议升级前备份 `./data/db`。

## v1.6.0 - 2026-10-31

### Added

- whisper.cpp 引擎（pywhispercpp），CPU / ARM NAS。
- 自动引擎选择：ARM 默认 whisper.cpp，x86 默认 faster-whisper。
- OpenAI 兼容云 ASR 兜底，默认关闭，支持隐私开关与 24MB 压缩上传。
- 词级对齐增强：标点断句、词概率置信度、低置信度核对原因。
- ASR 指标面板：识别次数、音频时长、RTF、平均置信度、引擎分布。
- 11 语言基准脚本与报告模板。
- 图像字幕 OCR sidecar：PGS/pgsrip，VobSub/DVD 抽帧 PoC。
- OCR 语言包：中/英/日/韩/俄/法/德/西/意/葡/泰。
- Emby 兼容输出：主字幕 + `SubX/` 变体。
- 核对页音频片段回放。
- Demucs / DeepFilterNet 音频预处理 PoC，失败自动回退。
- pyannote 说话人分离 PoC，可选启用。
- 设置页引擎、云 ASR、OCR、预处理、说话人分离和指标面板。

### Changed

- ASR sidecar 健康检查返回可用引擎、预处理和说话人分离能力。
- 自动来源判断新增 OCR：文本字幕 → 图像字幕 OCR → ASR。
- 任务状态新增 `ocr`，`sourceType` 新增 `ocr`。
- OCR / 增强 ASR 使用独立可选 Compose profile。

### Fixed

- 修复 ASR 低置信度置信度为 0 时被误当作有效置信度的问题。
- 修复监控目录稳定等待为 0 时仍等待 15 秒的问题。
- 修复核对页可访问性问题。

### Upgrade Notes

- 数据库自动迁移，旧媒体库、ASR、自动化、通知和 Token 配置保留。
- OCR 与增强 ASR 需要额外启动对应 profile，并挂载相同媒体目录。
- 云 ASR 默认关闭；开启后音频会上传到配置的云服务。
- 建议升级前备份 `./data/db`。

## v1.5.0 - 2026-10-31

### Added

- 目录监控：chokidar 实时监听 + 60 秒轮询兜底。
- 监控规则：扩展名、递归、包含/排除正则、体积、时长、创建/修改时间。
- 文件稳定检测、临时文件忽略、已有字幕/输出跳过、事件去重。
- 媒体库卡片“自动监控”开关。
- 历史回填：手动指定目录/时间范围，按全局自动并发逐步入队。
- 自动化页面：监控目录、规则折叠编辑、事件列表、失败重试。
- 通知渠道：Telegram、SMTP、Webhook、ntfy。
- 通知事件：任务完成/失败/取消、低置信度、监控异常、回填完成。
- 通知密钥加密、代理、测试发送、失败重试、投递记录。
- API Token：哈希存储、scope、过期时间、撤销、调用审计。
- OpenAPI 文档：`GET /api/openapi.json`。
- 自动化全局设置：任务并发上限、通知开关、低置信度阈值。

### Changed

- 任务新增 `origin` 与 `watch_event_id`，自动任务可回溯到监控事件。
- 任务列表/创建 API 支持 API Token scope 鉴权。
- 媒体库页面增加自动监控开关和自动化入口。
- 顶部与移动端导航增加“自动化”。

### Fixed

- 修复批量创建视频任务时重复加入 `taskIds` 的问题。
- 修复 ASR 监控目录稳定等待为 0 时仍按 15 秒处理的问题。
- 修复核对页 textarea 与预览区可访问性问题。

### Upgrade Notes

- 数据库自动迁移，新增监控、通知、Token 与审计表。
- 旧 Session 会失效，需要重新登录。
- 已配置的媒体库、ASR、翻译设置会保留。
- 自动任务默认并发 1，可在自动化页调整。
- 建议升级前备份 `./data/db`。

## v1.4.0 - 2026-10-31

### Added

- 本地 faster-whisper ASR sidecar
- 无字幕视频音频提取、语音识别、字幕生成
- 设置页「语音识别」Tab
- ASR 任务详情源语言/置信度展示
- ASR 原始字幕下载
- ASR 低置信度核对筛选与高亮
- ASR 低配/主流/进阶一键预设
- ASR 模型加载入口
- NVIDIA GPU ASR sidecar Dockerfile
- `sourceType=auto` 自动选择文本字幕或 ASR
- ASR 模型下载/加载状态轮询
- ASR sidecar CPU 镜像构建 workflow
- `sourceType=auto` 自动选择字幕或 ASR
- 单 Compose 通过 profile 可选启用 ASR / ASR-GPU
- ASR 低置信度核对筛选
- ASR 模型加载状态轮询


## v1.3.0 - 2026-10-30

### Added

- SQLite 持久任务队列：任务落盘、心跳、失败重试、容器重启后自动恢复。
- Provider 抽象：支持 OpenAI 兼容、Anthropic 原生、Gemini 原生。
- NAS 本地模型接入指引：Ollama、LM Studio、llama.cpp、vLLM。
- 核对页大文件优化：分页和 `J/K`、`Enter`、`Ctrl/Cmd+S` 快捷键。
- Playwright 视觉回归与 axe 可访问性检查。
- `/api/metrics` 轻量 Prometheus 指标。
- Docker `PUID/PGID` 与自动数据目录权限修复。

### Changed

- 设置页改为独立页面和 Tab 导航。
- 首页、历史、任务详情、核对页响应式布局优化。
- 主色调整为 teal，并提高按钮、小字对比度。
- 文件树、表单、Select 等补充可访问性语义。
- Docker 镜像固定版本说明和详细 Compose 注释。

### Fixed

- 容器数据目录不可写导致 `SQLITE_CANTOPEN`。
- 核对页 `v-memo` 导致的 SSR 错误。
- 任务详情页初始化顺序导致的 SSR 错误。
- 多个 Select 缺少可访问名称。
- 部分按钮和小字对比度不足。
- Docker 构建 `npm ci` 锁文件不一致。

### Upgrade Notes

- 升级前建议备份 `./data/db`。
- 旧 Session 会失效，需要重新登录。
- 旧明文 API Key 会自动迁移到加密存储。
- 运行中任务会通过持久队列恢复。
- 更换 `SUBX_SECRET_KEY` 后需要重新填写 API Key。
