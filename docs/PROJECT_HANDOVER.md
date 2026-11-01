# SubX 技术交接文档

> 当前版本：v2.6.1
> 最后更新：2026-11-01
> 适用对象：后续接手开发、部署、测试和维护 SubX 的开发者。
> 本文是项目总览；具体操作细节以 `docs/usage.md`、`docs/deployment.md`、`docs/testing-guide.md` 为准。

---

## 1. 项目是什么

SubX 是面向 NAS / 本地私有环境的视频字幕提取、翻译、自动化和质量校对工具。

它解决的问题：

```text
发现视频 → 判断字幕来源 → 提取/OCR/ASR → 翻译 → 质量校验 → 人工核对 → 导出 → 通知 → 继续处理
```

核心定位：

- 本地优先，API Key、字幕和媒体尽量留在自己的机器。
- 不强制 GPU，不强制 Redis；运行时不依赖大模型内置镜像，模型由用户手动下载。
- 支持手动任务和目录监控自动任务。
- 支持 NAS、矿机、低配 x86、ARM、可选 NVIDIA GPU。
- 主要面向单机/单 NAS；PostgreSQL 多实例能力已提供但仍偏实验。

---

## 2. 当前版本状态

- 版本：`v2.6.1`
- 技术栈：
  - Nuxt 4.6.3
  - Vue 3.5.44
  - Nuxt UI 4.12
  - Nitro 2.13
  - SQLite（默认）/ PostgreSQL（可选）
  - TypeScript
  - Python FastAPI 内置服务：ASR、OCR（同一镜像，可选拆分 sidecar）
- 生产依赖安全状态：
  - critical：0
  - high：0
  - moderate：17
  - low：3
  - 剩余的 moderate/low 主要来自 Nuxt/Nitro/Vite/ESLint 上游，当前最新版本暂无修复。
- 测试状态：
  - Vitest：99 passed / 1 skipped（PG live 测试在本地无 PG 时跳过）
  - Playwright：13 passed
  - PostgreSQL Smoke CI：真实 PG 17 通过
  - lint / typecheck / build：通过

---

## 3. 完整版本规划与演进

### 3.1 原始路线

| 版本 | 目标 | 状态 |
| --- | --- | --- |
| v1.0–v1.3 | 核心字幕提取、翻译、核对、导出、持久队列、Provider 抽象 | 已完成 |
| v1.4 | 本地 ASR MVP、无字幕视频 | 已完成 |
| v1.5 | 目录监控、历史回填、通知、API Token | 已完成 |
| v1.6 | whisper.cpp、云 ASR、OCR、Emby 变体、音频回放 | 已完成 |
| v1.7 | 增强音频、说话人分离、双模型质量校验 | 已完成 |
| v1.8 | Sonarr/Radarr/Jellyfin/Plex/Emby/Bazarr、更多通知、多 Worker、规则模板 | 已完成 |
| v1.9 | OCR 异步任务、哈希去重、并行识别、进度 | 已完成 |
| v2.0 | RapidOCR、AI 校对、术语学习、质量筛选、PG 迁移工具 | 已完成 |
| v2.1 | PostgreSQL 运行时、多主机 Worker | 已完成，低并发 |
| v2.2 | 稳定性、多 Worker claim、sidecar 鉴权、一致性修复 | 已完成 |
| v2.3 | 实测版、真实 PG smoke、部署与实测指南 | 已完成 |
| v2.4 | 依赖安全升级 | 已完成 |
| v2.5 | 单镜像 all-in-one、模型下载管理、下载代理 | 已完成 |
| v2.6 | 有字幕强制 ASR、ASR 配置生效、配置缓存修复 | 已完成 |
| v2.6.1 | 登录帮助、口令统一、Telegram 代理、ASR 连接可靠性 | 已完成 |

### 3.2 推荐后续路线

> 这是建议，不是硬性承诺。真实硬件测试结果出来后再调整优先级。

| 阶段 | 建议目标 |
| --- | --- |
| v2.7 | 真实 NAS/媒体实测、OCR 准确率报告、多 Worker 压测、迁移回滚 |
| v2.8 | PostgreSQL 异步 DB 层、`media_assets`、音频 hash、离线 ASR 模型 |
| v2.9 | OCR VobSub/DVD 质量、更多语言/格式、音频片段增强 |
| v3.0 | 多实例生产化、生态集成扩展、完整质量与性能面板 |

---

## 4. 已完成能力

### 4.1 字幕与翻译

- 内嵌字幕提取：SRT、ASS/SSA、VTT、mov_text。
- 外挂字幕：SRT、ASS/SSA、VTT。
- 自动来源判断：内嵌文本字幕 → 外挂字幕 → OCR → ASR。
- 手动任务可在有字幕时强制选择 ASR，忽略现有文本/图像字幕并重新听写。
- OpenAI 兼容、Anthropic、Gemini Provider。
- 术语表、自定义风格、片名/背景/额外要求。
- 翻译缓存、非语言字幕跳过、自动重试、回退原文。
- 字幕核对：缺译、同源、串条、过长、低置信度、质量问题。
- 导出：纯译文、双语、仅原文；SRT、ASS、两者。
- Emby 兼容输出：主字幕 + `SubX/` 变体。

### 4.2 ASR

- faster-whisper（x86 默认）。
- whisper.cpp / pywhispercpp（ARM 默认优先）。
- 云 ASR 兜底，默认关闭。
- VAD、词级时间戳、分句、幻觉过滤、低置信度。
- 模型下载管理：进度、速度、ETA、暂停、续传、取消、重试、卸载、HTTP(S) 代理、HF 镜像站。
- 单镜像内置 CPU ASR；CPU/GPU、ARM64 拆分 sidecar 继续保留。
- 可选 Demucs / DeepFilterNet 预处理。
- 可选 pyannote 说话人分离。
- 回调失败自动回退原始音频。

### 4.3 OCR

- PGS：FFmpeg 提取 `.sup` + pgsrip + Tesseract/RapidOCR。
- VobSub / DVD：FFmpeg 烧录到黑底 + 抽帧 + 哈希去重 + 并行 OCR。
- 异步任务：创建、轮询、取消。
- `OCR_FPS`、`OCR_WORKERS`、`OCR_MIN_CONFIDENCE`、`OCR_MAX_SECONDS`。
- 28 种语言配置。
- 超过最大时长明确报错。

### 4.4 自动化

- 监控目录：新建目录或媒体库整库开关。
- chokidar 实时监听 + 60 秒轮询兜底。
- 文件稳定检测、临时文件忽略、输出文件忽略。
- 规则：扩展名、递归、正则、体积、时长、时间范围。
- 已有字幕/输出跳过。
- 幂等去重、失败重试、历史回填。
- 自动任务并发上限。
- 规则模板：电影、剧集、动画、低配 NAS、双语。

### 4.5 通知

- Telegram
- SMTP 邮件
- Webhook（HMAC）
- ntfy
- Discord
- Matrix
- 企业微信
- 事件筛选、代理、测试发送、失败重试、投递记录。

### 4.6 外部集成

- Sonarr / Radarr
- Jellyfin / Plex
- Emby / Bazarr
- Token 鉴权、路径前缀映射、事件去重、任务状态回写。

### 4.7 API 与安全

- API Token：哈希存储、scope、过期、撤销、调用审计。
- OpenAPI：`GET /api/openapi.json`。
- Session Cookie + scrypt 口令哈希。
- AES-256-GCM 加密 API Key、通知密钥、集成 Token。
- API Token scope：任务、自动化、Token、系统。
- sidecar 可选 `ASR_API_KEY` / `OCR_API_KEY`。
- 文件路径 realpath 越权校验，跳过符号链接。

### 4.8 质量

- 双模型逐条评分。
- 质量问题标签：漏译、增译、误译、不流畅、术语、格式等。
- 低分自动进入核对。
- 核对页质量筛选。
- AI 术语建议和一致性检查。
- 术语一键加入全局术语表。

### 4.9 数据库与任务

- SQLite 默认，WAL。
- PostgreSQL 可选，schema 与迁移脚本。
- 持久任务队列、心跳、原子 claim、陈旧任务回收。
- 多 Worker 的 watch event / notification delivery 原子 claim。

---

## 5. 当前未完成 / 未验证

### 5.1 需要真实环境验证

- 真实 NAS 上的 ASR RTF、内存、模型加载时间。
- J1900/J4125/N5105/N100/i3-8100/i5-8400 的基准数据。
- P106-100、RX 580、RTX 3060 的实际兼容性。
- 11 语言真实样本的 CER/WER 报告。
- VobSub/DVD OCR 的真实准确率和短字幕漏识别率。
- 多 Worker 长时间压测和故障恢复。
- 外部集成在真实 Sonarr/Radarr/Jellyfin/Plex/Emby/Bazarr 上的回调。
- PostgreSQL 异步/高并发性能。

### 5.2 代码层技术债

- PostgreSQL 同步桥仍阻塞 Node 事件循环，适合低并发。
- `PG_POOL_SIZE` 受串行桥接限制。
- 依赖审计仍有 Nuxt/Nitro/Vite/ESLint 上游 moderate/low。
- 数据库迁移没有完整回滚机制。
- 测试覆盖率仍偏低，`task.ts`、`watchService.ts`、`video.ts`、`db.ts` 覆盖不足。
- 自动任务和集成任务的部分跨表操作没有统一事务。
- `media_assets` 未实现，媒体探测结果没有缓存。
- 音频 hash 复用未实现。
- ASR 专用降级/重试还比较基础。
- OCR 抽帧仍会为整段视频生成帧，低配设备耗时较高。
- `@nuxt/ui` 4 已完成升级，但 UI 细节仍建议做一轮真实设备回归。

### 5.3 原计划中未完成项

来自 `TODO.md`：

- 11 语言 5–10 分钟样本。
- 硬件/GPU 基准和 RTF 报告。
- `media_assets` 表。
- 数据库迁移测试和回滚。
- 离线模型导入。
- 按需语言模型安装。
- 音频 hash/复用。
- ASR 失败重试与降级。
- `aligning` 状态。
- 音频提取 fixture、VAD fixture。
- 任务恢复测试。
- 技术调研：WhisperX、stable-ts、Demucs/UVR/DeepFilterNet/ClearerVoice、pyannote/3D-Speaker、PaddleOCR、Subtitle Edit、Apprise。
- 自动化规则模板已完成，更多生态集成仍可继续。

---

## 6. 架构总览

```text
Browser
  ↓
Nuxt UI Pages
  ↓
Nitro API
  ├─ Auth / Session / API Token
  ├─ Config
  ├─ Files / Media Roots
  ├─ Tasks / Review / Quality / Proofread
  ├─ Watch / Notifications / Integrations
  └─ ASR / OCR proxies
        ↓
SQLite or PostgreSQL
        ↓
Task Queue / Watch Service / Notification Worker
        ↓
FFmpeg / FFprobe
        ↓
内置 ASR / 内置 OCR（127.0.0.1） / 可选拆分 sidecar / Cloud AI
```

### 6.1 主应用

| 路径 | 作用 |
| --- | --- |
| `app/pages/index.vue` | 首页、文件浏览、任务创建入口 |
| `app/pages/history.vue` | 任务历史、诊断总览 |
| `app/pages/review/[id].vue` | 字幕核对、质量评分、AI 校对、音频回放 |
| `app/pages/task/[id].vue` | 任务详情、日志、诊断、ASR/OCR、质量报告 |
| `app/pages/settings.vue` | 设置入口 |
| `app/pages/automation.vue` | 监控、事件、通知、API Token、外部集成 |
| `app/pages/media-libraries.vue` | 媒体库和整库监控 |
| `app/components/FileBrowser.vue` | 文件树、轨道选择、ASR/OCR 入口 |
| `app/components/Settings.vue` | AI、ASR、OCR、质量、术语、风格设置 |
| `app/components/AsrModelManager.vue` | ASR 模型列表、下载进度、暂停/续传/取消/卸载 |

### 6.2 服务端

| 路径 | 作用 |
| --- | --- |
| `server/api/` | Nitro API 路由 |
| `server/utils/task.ts` | 任务队列、任务流水线、翻译/导出/通知联动 |
| `server/utils/translation.ts` | 翻译 Prompt、解析、重试、缓存 |
| `server/utils/subtitle.ts` | 字幕解析、分块、校验、ASS/SRT 输出 |
| `server/utils/video.ts` | ffprobe、字幕/音频提取、音频片段 |
| `server/utils/asr/` | ASR HTTP 客户端、结果转换、管理接口代理 |
| `server/utils/asr/admin.ts` | ASR 模型管理请求封装 |
| `server/utils/ocr/` | OCR job 客户端、轮询、进度 |
| `server/utils/watchService.ts` | 目录监听、轮询、自动任务、原子 claim |
| `server/utils/notifications.ts` | 通知适配器、队列、重试 |
| `server/utils/integrations.ts` | Sonarr/Radarr/Jellyfin/Plex/Emby/Bazarr |
| `server/utils/quality.ts` | 双模型质量评分 |
| `server/utils/proofreading.ts` | AI 术语/一致性建议 |
| `server/utils/db.ts` | SQLite schema 和数据库入口 |
| `server/utils/pgSync.ts` | PostgreSQL worker 同步桥 |
| `server/utils/config.ts` | 配置、加密、清理 |
| `server/middleware/auth.ts` | Session/API Token 鉴权 |

### 6.3 内置服务与可选 sidecars

| 路径 | 作用 |
| --- | --- |
| `asr-service/main.py` | faster-whisper / whisper.cpp / 预处理 / 说话人分离 |
| `asr-service/model_manager.py` | 模型下载、断点续传、暂停/取消、代理、状态持久化 |
| `ocr-service/main.py` | PGS / VobSub / DVD OCR、异步 job |
| `scripts/start-all-in-one.sh` | 同一容器内启动 Web + ASR + OCR |
| `scripts/pull-image.sh` | 镜像拉取、暂停续传提示、代理提示 |
| `scripts/asr-benchmark.mjs` | 11 语言 ASR 基准脚本 |
| `scripts/export-sqlite-to-postgres.mjs` | SQLite → PostgreSQL 数据迁移 |
| `scripts/postgres-schema.sql` | PostgreSQL schema |

---

## 7. 数据模型

主要表：

| 表 | 作用 |
| --- | --- |
| `config` | 全局配置，敏感值加密 |
| `tasks` | 任务主表 |
| `task_jobs` | 持久队列 |
| `task_logs` | 任务日志 |
| `task_responses` | AI 请求/响应/token 统计 |
| `task_review_entries` | 核对条目、ASR 置信度、质量评分 |
| `translations_cache` | 翻译缓存 |
| `transcription_runs` | ASR/OCR 运行记录 |
| `asr_segments` | ASR/OCR 分段、词、说话人 |
| `watch_folders` | 监控目录和规则 |
| `watch_events` | 监控事件、去重、任务关联 |
| `notification_channels` | 通知渠道 |
| `notification_deliveries` | 通知投递和重试 |
| `api_tokens` | API Token 哈希 |
| `api_audit_logs` | API Token 调用审计 |
| `integration_events` | 外部 Webhook 事件 |
| `translation_quality_runs` | 质量校验运行 |
| `translation_quality_entries` | 质量评分明细 |
| `auth` | 口令哈希 |
| `sessions` | Session 哈希 |
| `schema_migrations` | 迁移版本 |

数据库入口：`server/utils/db.ts`。
PostgreSQL schema：`scripts/postgres-schema.sql`。
PostgreSQL 同步桥：`server/utils/pgSync.ts`。

---

## 8. 关键流程

### 8.1 手动任务

```text
FileBrowser 选择文件
→ /api/task
→ TaskService.createTask
→ task_jobs 入队
→ TaskQueue 原子 claim
→ TaskService.process
→ 提取/OCR/ASR
→ 翻译
→ 质量校验
→ 核对数据落库
→ 导出 SRT/ASS
→ 通知
```

### 8.2 自动任务

```text
chokidar / 轮询 / 回填 / 外部 Webhook
→ watch_events（或 integration_events）
→ 原子 claim
→ TaskService.createTask
→ task_jobs
→ 后续同手动任务
```

### 8.3 OCR

```text
Task sourceType=ocr
→ OcrService 创建 job
→ OCR sidecar 提取 PGS 或抽帧
→ 哈希去重 + 并行 OCR
→ 轮询进度
→ 返回 segments
→ 转 SubtitleEntry
→ 翻译/核对/导出
```

### 8.4 质量校验

```text
主模型翻译
→ 第二模型逐条评分
→ 低分条目写入 review
→ 核对页质量筛选
→ 人工编辑后清除旧评分
```

---

## 9. 配置与部署

### 9.1 主应用关键环境变量

> 这里只列主应用关键变量。完整清单、默认值、取值范围和 Compose 逐项注释见 `docs/deployment.md` 第 4 节和根目录 `docker-compose.yml`。

| 变量 | 说明 |
| --- | --- |
| `VIDEO_DIR` | 默认媒体目录 |
| `DB_PATH` | SQLite 路径 |
| `DATABASE_URL` | PostgreSQL 连接串；设置后优先 PG |
| `PG_POOL_SIZE` | PG 连接池大小 |
| `SUBX_SECRET_KEY` | 敏感配置加密主密钥，强烈建议设置 |
| `PUID` / `PGID` | 容器运行用户 |
| `CHOWN_MEDIA` / `CHOWN_MODELS` | 启动时递归修复媒体目录 / 模型目录权限 |
| `RUN_AS_ROOT` | 跳过降权直接以 root 运行；仅排障 |
| `TRUST_PROXY` | 是否信任反向代理头 |
| `SUBX_ALLOWED_ORIGINS` | 额外允许来源 |
| `SUBX_ALL_IN_ONE` | 单镜像标记；自动迁移旧 sidecar 默认地址 |
| `SUBX_KEEP_LEGACY_SIDECAR_URLS` | 单镜像中保留旧的 `subx-asr` / `subx-ocr` 地址 |
| `ASR_INTERNAL_PORT` / `OCR_INTERNAL_PORT` | 内置服务监听端口，默认 `8000` / `8001` |
| `ASR_INTERNAL_URL` / `OCR_INTERNAL_URL` | 内置服务地址，默认 `127.0.0.1:8000` / `8001` |
| `ASR_MODEL_DIR` | 模型缓存目录，默认 `/models` |
| `ASR_WHISPER_CPP_MODEL_DIR` | whisper.cpp 模型目录，默认 `/models/whisper-cpp` |
| `ASR_AUTO_DOWNLOAD` | 是否允许静默下载模型；单镜像默认 `false` |
| `ASR_DOWNLOAD_PROXY` | 模型下载默认 HTTP(S) 代理 |
| `ASR_HF_ENDPOINT` | Hugging Face 镜像站 |
| `ASR_PREPROCESS` | 音频预处理；Demucs/DeepFilterNet 仅 enhanced sidecar |
| `ASR_API_KEY` | ASR 服务可选鉴权 |
| `OCR_API_KEY` | OCR 服务可选鉴权 |
| `OCR_POLL_MS` | OCR 任务轮询间隔（毫秒），高级参数 |
| `SUBX_WORKER_ID` / `SUBX_WORKER_STALE_SECONDS` | 多 Worker 实例标识 / 陈旧任务回收时间 |

### 9.2 Compose profiles

```bash
docker compose up -d                         # 主应用 + 内置 ASR + 内置 OCR
docker compose --profile asr up -d asr       # 可选：拆分 CPU ASR sidecar
docker compose --profile asr-gpu up -d asr-gpu
docker compose --profile asr-enhanced up -d asr-enhanced
docker compose --profile ocr up -d ocr       # 可选：拆分 OCR sidecar
docker compose --profile postgres up -d postgres
```

### 9.3 发布/升级

- 升级前备份 `./data/db`、`./data/models` 和 PostgreSQL。
- SQLite → PostgreSQL 使用 `scripts/export-sqlite-to-postgres.mjs`。
- 镜像 tag 与 `package.json` 版本保持一致。
- tag 构建偶尔可能卡住，已增加 `retag-release.yml` 作为 fallback。
- 修改版本时同步：`package.json`、`CHANGELOG.md`、`README.md`、`docker-compose.yml`、`docs/`、`server/api/openapi.get.ts`。

---

## 10. 测试与质量

### 10.1 本地命令

```bash
npm run lint
npm run typecheck
npm test
npm run test:pg
npm run build
npm run test:e2e
npm run test:e2e:update
```

### 10.2 CI

- `ci.yml`：lint、typecheck、unit、build、E2E。
- `pg-smoke.yml`：真实 PostgreSQL 17。
- `docker-build.yml`：主镜像（v2.5.0 起为 all-in-one）。
- `asr-image.yml`：ASR CPU 镜像。
- `ocr-image.yml`：OCR 镜像。
- `retag-release.yml`：tag 构建卡住时，从 sha 镜像重标记版本。
- `cleanup-old-images.yml`：手动删除 GHCR 旧镜像版本，保留当前版本 / latest / 当前 sha。

### 10.3 测试缺口

- `task.ts`、`watchService.ts`、`video.ts`、`db.ts` 覆盖率低。
- 没有 Python 服务端单测（ASR/OCR/模型下载管理）。
- 没有真实 OCR/ASR 端到端测试，也没有大文件断点续传压测。
- 没有多 Worker 并发压测。
- 没有迁移回滚测试。

---

## 11. 安全模型

已实现：

- Session Cookie：HttpOnly、SameSite=Lax、HTTPS 时 Secure。
- 口令：scrypt 加盐哈希。
- Session：只存 SHA-256 哈希。
- API Key / 通知密钥 / 集成 Token：AES-256-GCM。
- API Token：哈希存储、scope、过期、撤销、审计。
- 文件路径：realpath 越权校验。
- 外部集成：Token 校验、常量时间比较。
- 内置 ASR/OCR 只监听 `127.0.0.1`；拆分 sidecar 可选 Token。

已知风险：

- 内置服务只绑定回环地址，正常不应暴露；拆分 sidecar 默认不鉴权，生产必须设置 `ASR_API_KEY` / `OCR_API_KEY`，且不要暴露端口。
- 模型下载代理地址由用户输入，服务端只允许 HTTP(S)，不会持久化到数据库。
- 通知 Webhook 可访问内网，拥有 `automation:write` 的 Token 存在 SSRF 面。
- PostgreSQL 同步桥高并发会阻塞事件循环。
- 依赖仍有 moderate/low 上游问题。
- 口令限流是进程内实现，多 Worker 不共享。

---

## 12. 常见维护任务

### 新增 API 字段/表

1. 更新 `server/utils/db.ts` SQLite schema。
2. 更新 `scripts/postgres-schema.sql`。
3. 更新 `types/index.d.ts`。
4. 更新 API 序列化/反序列化。
5. 更新 UI。
6. 加迁移和测试。
7. 更新 OpenAPI。
8. 更新文档。

### 新增 ASR/OCR Provider

1. 在内置服务或 sidecar 增加能力/健康检查。
2. 在 `server/utils/asr` 或 `server/utils/ocr` 增加客户端。
3. 在任务流水线接入。
4. 增加配置开关和 UI。
5. 增加 sidecar 鉴权。
6. 增加测试和文档。

### 新增通知渠道

1. 在 `NotificationChannelType` 增加类型。
2. `notifications.ts` 增加 sanitize/encrypt/send。
3. 设置/自动化 UI 增加字段。
4. 加单元测试。
5. 更新文档。

### 新增外部集成

1. 扩展 `IntegrationSource`。
2. 更新 payload 解析和路径映射。
3. 更新中间件公开路径。
4. 更新 UI 集成列表。
5. 加去重和测试。
6. 更新文档。

---

## 13. 交接阅读顺序

1. 本文 `docs/PROJECT_HANDOVER.md`
2. `README.md`
3. `docs/usage.md`
4. `docs/deployment.md`
5. `docs/testing-guide.md`
6. `docs/asr-automation-plan.md`
7. `TODO.md`
8. `CHANGELOG.md`
9. 代码入口：
   - `server/utils/db.ts`
   - `server/utils/task.ts`
   - `server/utils/watchService.ts`
   - `server/utils/notifications.ts`
   - `server/utils/integrations.ts`
   - `server/utils/pgSync.ts`
   - `app/pages/automation.vue`
   - `app/pages/review/[id].vue`
   - `asr-service/main.py`
   - `ocr-service/main.py`

---

## 14. 代码与文档维护约定

- 修改任务/监控/通知/数据库时，优先补注释和测试。
- 新功能必须有配置开关或环境变量。
- 外部副作用失败不能让主任务直接崩溃。
- 日志要包含任务 ID 和可排查原因。
- 不在日志里输出完整密钥。
- 数据库变更必须同时更新 SQLite 和 PostgreSQL schema。
- 版本发布必须更新镜像 tag、文档、OpenAPI、CHANGELOG。
- 归档文档放在 `docs/archive/`，不要继续在根目录堆放旧设计稿。

---

## 15. 结论

SubX 已经具备完整的“手动 + 自动 + ASR/OCR + 质量 + 通知 + 集成 + API”能力，v2.6.1 单镜像适合作为真实环境实测基线。

下一阶段不建议继续无上限加功能，而应优先：

1. 真实 NAS/媒体测试。
2. OCR 准确率和性能。
3. PostgreSQL 异步 DB 层与多 Worker 压测。
4. 测试覆盖率和迁移回滚。
5. 依赖 moderate/low 上游跟进。

只有在实测数据明确后，再决定是继续做质量、生态集成，还是性能/多实例。
