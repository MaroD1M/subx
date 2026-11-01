# Changelog

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
