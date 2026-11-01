# SubX ASR / 自动化开发 TODO

> 配套文档：`docs/asr-automation-plan.md`、`docs/PROJECT_HANDOVER.md`
> 本文保留细粒度开发清单；当前状态和路线图以技术交接文档为准。
> 当前基线：v2.6.1
> 当前进度：v2.6.1 登录帮助、口令统一、Telegram 代理和 ASR 连接可靠性修复

## v1.4.0 手动 ASR MVP

> v1.4.0 MVP 已完成。以下未勾选项属于后续增强，不阻塞 v1.4.0 发布：
> media_assets、aligning 状态、音频 hash 复用、离线模型导入、按需语言模型、ASR 专用重试、VAD/音频自动化 fixture。


### 研究与基准
- [ ] 准备英/日/韩/中/俄/法/泰/西/德/意/葡 11 语言 5–10 分钟样本
- [ ] 基准设备：J1900、J4125、N5105、N100、i3-8100、i5-8400
- [ ] 可选 GPU 基准：P106-100、RX 580、RTX 3060
- [ ] 记录各设备 RTF、内存占用、模型可用性
- [ ] 测 CPU int8 / GPU float16 的 RTF 与准确率
- [ ] 确定首批模型组合（small / medium / large-v3-turbo）
- [ ] 确定 ASR sidecar 镜像与模型缓存目录

### 数据库
- [ ] 新增 `media_assets`
- [x] 新增 `transcription_runs`
- [x] 新增 `asr_segments`
- [x] `tasks` 增加 `source_language`、`asr_run_id`、`asr_confidence`（source_mode 待补）
- [x] 任务状态增加 `extracting_audio`、`transcribing`（probing/aligning 待补）
- [ ] 数据库迁移测试

### ASR sidecar
- [x] 新建 `asr-service/`
- [x] FastAPI `/health`
- [x] `/models`
- [x] `/v1/audio/transcriptions`
- [x] faster-whisper 引擎
- [x] Silero VAD（通过 faster-whisper vad_filter）
- [x] word timestamps
- [x] 模型下载/缓存
- [ ] 离线模型导入
- [ ] 按需安装额外语言模型
- [x] CPU/GPU 自动检测
- [x] Dockerfile CPU
- [x] Dockerfile GPU
- [x] 健康检查与资源限制

### 媒体处理
- [x] `VideoService.probeMedia`
- [x] 音频轨道选择
- [x] FFmpeg 音频提取
- [x] 临时音频目录与清理策略
- [ ] 音频 hash/复用

### 任务流水线
- [x] `sourceType=auto` 自动选择字幕或 ASR
- [x] 来源优先级判断（文本字幕优先，无字幕走 ASR）
- [x] ASR 阶段插入 `TaskService.process`
- [x] 任务取消中止 ASR（signal 传递）
- [ ] 失败重试与降级
- [x] ASR 结果转 `SubtitleEntry`
- [x] 词级时间轴基础分句（CPS/合并短句待补）
- [x] 幻觉过滤
- [x] 低置信度标记与核对筛选

### UI
- [x] 设置页「语音识别」Tab
- [x] 引擎/模型/设备/精度选择
- [x] 源语言/自动检测
- [x] 模型下载/加载状态轮询
- [x] 音频保留策略
- [x] 首页无字幕提示
- [x] 音频轨道选择
- [x] 任务详情 ASR Tab
- [x] 核对页置信度筛选与高亮

### 测试
- [ ] 音频提取 fixture
- [ ] VAD fixture
- [x] 字幕分句基础单测（CPS 待补）
- [x] 幻觉过滤单测
- [ ] 任务恢复测试
- [x] Playwright ASR 设置页

## v1.5.0 自动化、通知与 API

> v1.5.0 已完成。额外通知渠道（Matrix/Discord/企业微信等）调研顺延到 v1.6+，不影响本版本发布。

### 监控目录
- [x] `watch_folders` 表
- [x] `watch_events` 表
- [x] chokidar 监听
- [x] 轮询兜底
- [x] 文件稳定检测
- [x] 临时文件忽略
- [x] 输出文件忽略
- [x] 幂等去重
- [x] 新建监控目录
- [x] 现有媒体库开启监控
- [x] 新文件触发
- [x] 历史回填（仅手动指定目录/时间段）
- [x] 失败重试

### 规则
- [x] 扩展名
- [x] 递归
- [x] include/exclude 正则
- [x] 文件大小上下限
- [x] 视频时长下限
- [x] 创建/修改时间范围
- [x] 已有字幕跳过
- [x] 已有输出跳过
- [x] 输出模式/目标语言/风格
- [x] 并发上限（默认 1）

### 通知
- [x] `notification_channels` 表
- [x] `notification_deliveries` 表
- [x] Telegram Bot
- [x] 邮件 SMTP
- [x] Webhook
- [x] ntfy（优先扩展）
- [x] 通知渠道扩展调研（Matrix/Discord/企业微信等）
- [x] Apprise 适配设计参考：Telegram + 邮件 + ntfy + Webhook
- [x] 只参考设计，不直接集成
- [x] 代理配置
- [x] 测试发送
- [x] 失败重试
- [x] 低置信度通知

### API
- [x] API Token 表
- [x] Token scope/过期
- [x] OpenAPI
- [x] 任务创建/查询/取消
- [x] 监控目录 CRUD
- [x] 通知渠道测试
- [x] 审计日志

### UI
- [x] 媒体库监控开关
- [x] 自动化页面
- [x] 规则折叠编辑
- [x] 事件列表
- [x] 失败重试
- [x] 通知配置
- [x] 移动端适配

### 测试
- [x] 监控触发测试
- [x] 幂等/防循环测试
- [x] 通知 mock 测试
- [x] API Token 权限测试
- [x] Playwright 自动化页

## v1.6.0 多引擎、云兜底、OCR 与增强 PoC

> v1.6.0 已完成 MVP。增强 PoC 通过可选 sidecar 提供，默认关闭；OCR 的 VobSub/DVD 与说话人分离属于 PoC，速度和准确率取决于硬件与模型。

- [x] whisper.cpp 引擎（pywhispercpp，CPU / ARM）
- [x] ARM NAS 支持（arm64 镜像 + arm 默认 whisper.cpp）
- [x] OpenAI 兼容云 ASR Provider（默认关闭）
- [x] 云 ASR 保留扩展位，本地优先；Azure/Google/豆包暂不投入主要预算
- [x] 云失败策略与隐私开关
- [x] 词级对齐增强（标点断句 + 词概率置信度）
- [x] 低置信度核对增强（`low_asr_confidence`）
- [x] 11 语言基准脚本与报告模板（`scripts/asr-benchmark.mjs`、`docs/asr-benchmark.md`）
- [x] ASR 指标面板（`/api/asr/metrics` + 设置页）
- [x] Emby 主字幕 + `SubX/` 变体输出
- [x] 音频片段回放（核对页）
- [x] OCR 基础能力（PGS 优先，VobSub/DVD 抽帧 PoC；中文/英文优先）
- [x] 抗音乐/环境音增强 PoC（Demucs / DeepFilterNet，可选 sidecar）
- [x] 说话人分离 PoC（pyannote，可选 sidecar）
- [x] 预处理失败自动回退原始音频

## v1.7.0+ 质量与生态扩展

> v1.8.0 已完成本条线。OCR 仍以 PGS 稳定、VobSub/DVD 抽帧 PoC 为边界；PostgreSQL 仅完成迁移评估，默认仍为 SQLite。

- [x] 说话人分离生产化（可选 enhanced sidecar，speaker 入库/展示）
- [x] 抗音乐/环境音增强生产化（Demucs / DeepFilterNet，失败回退）
- [x] 双模型交叉校验
- [x] OCR 语言/格式扩展（28 语言、低置信度过滤、抽帧置信度）
- [x] Sonarr/Radarr webhook
- [x] Jellyfin/Plex 集成
- [x] 更多通知渠道（Discord / Matrix / 企业微信）
- [x] 多 Worker / 多实例（陈旧任务回收 + Worker ID）
- [x] PostgreSQL 迁移评估
- [x] 翻译质量评分
- [x] 自动化规则模板

## v1.9.0 OCR 生产化

- [x] OCR 异步任务接口（创建/状态/取消）
- [x] 任务进度轮询接入任务状态
- [x] 抽帧图像哈希去重
- [x] 并行 Tesseract OCR
- [x] `OCR_FPS` / `OCR_WORKERS` / `OCR_MIN_CONFIDENCE` 可配置
- [x] 抽帧 OCR 置信度写入
- [x] PGS / VobSub / DVD 统一任务入口

## v2.0.0 质量与生态扩展

- [x] RapidOCR / pgsrip AutoEngine
- [x] Emby / Bazarr Webhook
- [x] AI 术语建议与一致性检查
- [x] 核对页质量筛选与长列表性能优化
- [x] PostgreSQL schema + 数据迁移脚本
- [x] PostgreSQL 运行时切换（worker + 共享内存同步桥）

## v2.2.0 稳定性修复

- [x] PostgreSQL 查询序号校验与 worker 超时重启
- [x] PG worker idle client 错误监听
- [x] watch event / notification 原子 claim
- [x] 通知 processing 卡住恢复
- [x] 自动来源优先使用外挂字幕
- [x] 音频回放使用正确音轨
- [x] OCR 超时长明确报错
- [x] 质量阈值读取配置、编辑后清除旧评分
- [x] 任务删除清理 ASR/质量孤儿数据
- [x] 外部集成去重
- [x] sidecar 可选鉴权
- [x] API Token scope 与 OpenAPI 补齐

## v2.6.1 登录、通知与 ASR 可靠性

- [x] 登录页「获取帮助」内置帮助弹窗
- [x] 口令最小长度统一为 8 位（代码 + 文档）
- [x] 已登录访问 `/login` 自动回首页
- [x] 退出登录失败时清理本地状态并回登录页
- [x] Telegram/通知出站改用 undici fetch，支持渠道代理和环境代理
- [x] 通知代理测试接口与 UI 按钮
- [x] ASR 连接失败重试、内置地址兜底、错误显示实际地址和原因
- [x] 单镜像启动等待 ASR/OCR 健康检查
- [x] 补充忘记口令、通知代理和 ASR 排障文档
- [ ] 真实 NAS 上验证低配 CPU 的 ASR 冷启动和 Telegram 代理

## v2.6.0 有字幕强制 ASR 与配置修复

- [x] 有文本字幕的视频可手动打开「语音识别」开关，忽略现有字幕并重新听写
- [x] ASR 设备 / 计算精度随请求传给服务端，不再只改 UI
- [x] 设置页保存后清理 Nuxt 配置缓存，返回首页立即生效
- [x] 单镜像旧 sidecar 地址只迁移一次，用户保存的地址不会被覆盖
- [x] 补充环境变量 / Compose 注释 / 文档
- [ ] 真实媒体验证强制 ASR 的字幕质量与耗时
- [ ] 批量任务按文件选择来源（ASR / 字幕 / OCR）

## v2.5.0 单镜像与模型下载

- [x] 主应用、ASR、OCR 合并为单一运行时镜像
- [x] 内置 ASR/OCR 只监听回环地址
- [x] 单镜像默认地址迁移到 `127.0.0.1:8000` / `8001`
- [x] 旧 sidecar 地址自动迁移，可用 `SUBX_KEEP_LEGACY_SIDECAR_URLS` 关闭
- [x] ASR 模型下载管理：进度、速度、ETA、暂停、续传、取消、重试、卸载
- [x] 下载任务持久化与容器重启恢复
- [x] HTTP(S) 下载代理与 Hugging Face 镜像站
- [x] 设置页「本地模型管理」
- [x] 镜像拉取辅助脚本：进度、暂停提示、续传、代理说明
- [x] OCR 内置 Tesseract / RapidOCR，无需下载模型
- [x] 文档、CHANGELOG、交接文档和 Compose 更新
- [ ] 真实大文件（>3GB）断点续传压测
- [ ] 国内镜像站/HF_ENDPOINT 实测报告
- [ ] 单镜像内存占用与多任务并发实测
- [ ] 离线模型导入（从 U 盘/共享目录导入）

## 技术调研与开源参考

- [ ] faster-whisper / whisper.cpp / WhisperX / stable-ts 对比
- [x] Silero VAD（通过 faster-whisper vad_filter） / sherpa-onnx / FunASR / SenseVoice 评估
- [ ] Demucs / UVR / DeepFilterNet / ClearerVoice-Studio 评估
- [ ] pyannote / WhisperX diarization / 3D-Speaker 评估
- [ ] PaddleOCR / Tesseract / pgsrip / Subtitle Edit 参考
- [ ] Apprise 通知适配能力调研
- [ ] 云 ASR 保持关注，不作为首阶段投入；本地方案优先
- [ ] 记录 PoC 指标：CER/WER、RTF、字幕可读性、资源占用

- [x] ASR sidecar CPU 镜像 CI

## 每个版本的完成标准

- [x] `npm run lint` 通过
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过
- [x] `npm run build` 通过
- [x] 相关 E2E/截图更新
- [x] 文档更新
- [ ] 数据库迁移可回滚
- [x] 新功能有配置开关
- [x] 失败路径有日志和用户提示
