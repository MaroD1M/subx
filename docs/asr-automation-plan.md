# SubX 无字幕影视自动字幕技术方案

> 文档版本：v1.2
> 适用项目版本：SubX v2.6.1
> 目标版本：v2.6.1
> 状态：v2.6.1 登录帮助、Telegram 代理与 ASR 连接可靠性修复已落地

---

## 1. 目标

把 SubX 从“字幕翻译工具”升级为面向 NAS 的自动字幕流水线：

```text
发现视频 → 判断字幕来源 → 本地语音识别 → 翻译 → 核对 → 导出 → 通知 → 继续监控下一部
```

核心原则：

- **本地优先**：默认使用 NAS 本地硬件完成音频提取和 ASR。
- **自动优先**：有文本字幕时优先复用，避免不必要的语音识别。
- **低错误率**：VAD、分句、幻觉过滤、词级时间轴、低置信度核对。
- **低门槛**：支持 CPU、核显、NVIDIA GPU，也支持可选云 ASR 兜底。
- **可接手**：架构、数据模型、接口、TODO 和验收标准全部文档化。
- **NAS 友好**：不强制 Redis、不强制 GPU、不把模型塞进主镜像。

---

## 2. 已确认决策

| 决策项 | 选择 |
|---|---|
| 主要硬件 | 混合硬件：默认 CPU 可跑，GPU 自动加速，低配可接云兜底 |
| ASR 部署 | 独立 sidecar + 可选云兜底 |
| 本地 ASR 引擎 | 多引擎可切换 |
| 云 ASR | 可选，默认关闭 |
| 首批语言 | 英语（含美式）、日语、韩语；中文、俄语、法语、泰语、西语、德语、意语、葡语可配置 |
| 字幕来源 | 自动：文本字幕 > 外挂 > OCR > ASR |
| 质量功能首批 | VAD + 分句 + 幻觉过滤 + 词级时间轴对齐 |
| 自动化 | 新文件监控、历史回填、失败重试/通知；支持新建监控目录或在媒体库开启监控 |
| 通知 | Telegram、邮件、Webhook |
| 输出 | 同目录存放，区分语言/版本，兼容 Emby |
| 音频临时文件 | 可配置保留策略 |
| 外部接口 | REST + API Token + OpenAPI |
| 模型预算 | 10–20GB |
| 首版范围 | 手动 ASR + 翻译 + 核对 |
| 数据库 | SQLite 单实例 |

### 2.1 第二轮细化决策

| 决策项 | 选择 |
|---|---|
| 其他语言 | 中文（简/繁）、俄语、法语、泰语、西班牙语、德语、意大利语、葡萄牙语；后续可按需安装语言模型 |
| Emby 多版本 | 媒体目录只放一个主字幕，变体放 `SubX/` |
| 历史回填范围 | 只处理手动指定目录/时间段，不默认全库扫描 |
| 监控并发 | 默认 1 个，可在设置中调整 |
| ARM whisper.cpp | v1.6 再做 |
| 云 ASR 首批 | OpenAI 兼容优先 |
| 高级功能 | 音频片段回放 v1.6；OCR 提前到 v1.6；双模型、说话人分离、抗音乐/环境音增强 v1.7+ |
| 通知首批 | Telegram + 邮件 SMTP + Webhook；ntfy 优先扩展，后续研究 Matrix、Discord、企业微信等 |
| 模型获取 | UI 下载 + 离线导入都支持 |

### 2.2 第三轮决策

| 决策项 | 选择 |
|---|---|
| 目标处理速度 | 不设固定绝对时间，按设备性能基准和实测 RTF 评估；提供极速/均衡/高精度档位 |
| 说话人分离 | 未来必做；v1.6 先做 PoC，v1.7+ 生产化 |
| 抗音乐/环境音干扰 | 未来必做；v1.6 先做 PoC，v1.7+ 生产化 |
| 通知扩展 | ntfy 优先；后续再评估 Matrix、Discord、企业微信等 |
| OCR | 提前到 v1.6，PGS/VobSub/DVD 都做，中文/英文优先 |
| 云 ASR 扩展 | 本地优先；OpenAI 兼容保留为可选兜底；Azure/Google/豆包后续按需评估 |
| 技术调研 | 尽量复用成熟开源项目，避免重复造轮子 |
| 硬件预设 | 提供低配 / 主流 / 进阶一键预设 |

### 2.3 目标硬件基线

默认按“常见矿机 / 黑群晖”设计，不假设用户有 NVIDIA GPU：

| 档位 | 典型设备 | 建议 |
|---|---|---|
| 入门 | J1900 / J4125，4 核，4–8GB | 仅建议 whisper.cpp small 或云兜底；不适合 medium/large |
| 主流 | N5105 / N100 / i3-8100，4 核，8–16GB | faster-whisper small/medium int8 |
| 进阶 | i5-8400 / Ryzen 5，6 核，16–32GB | faster-whisper medium / large-v3-turbo int8 |
| 矿卡/GPU 可选 | P106-100 6GB、RX 580 8GB、RTX 3060 12GB | 驱动可用时 large-v3-turbo；不保证所有矿卡/旧卡可用 |

补充原则：

- 8GB 内存只建议 small 模型；16GB 起步更稳。
- 黑群晖 / 矿机通常没有 GPU，CPU-only 是默认路径。
- J1900 等老 CPU 缺少 AVX2，faster-whisper 可能非常慢，优先 whisper.cpp 或云兜底。
- P106-100 无显示输出、驱动依赖特殊方案；RX 580 的 ROCm 支持不稳定；不把矿卡作为默认支持范围。
- 模型缓存预留 10–20GB；音频临时文件约 115MB/小时（16kHz 单声道 WAV）。
- 所有速度以目标设备实测 RTF 为准，不做统一承诺。

### 2.4 第四轮决策

| 决策项 | 选择 |
|---|---|
| 本地方案优先级 | 本地 ASR 是第一要素；云 ASR 仅保留扩展位 |
| 国内 ASR | 豆包及其他国内 ASR 暂不作为首阶段重点，预算优先级降低 |
| OCR 首批语言/格式 | 中文、英文优先；PGS/VobSub/DVD 都做 |
| 说话人分离 / 背景音 | 允许本地运行，低配也可手动开启；默认关闭，稳定性优先 |
| 通知适配层 | 只参考 Apprise 适配设计，不直接集成 |

---

## 3. 当前技术栈与改造边界

### 3.1 保留

- Nuxt 4 / Vue 3 / Nuxt UI / Tailwind CSS
- Nitro API
- SQLite + `better-sqlite3` WAL
- 现有持久任务队列
- 现有 Translation Provider 抽象
- FFmpeg / ffprobe
- 现有核对、导出、日志、诊断
- Docker + PUID/PGID + 多架构

### 3.2 新增

- Python ASR sidecar
- `TranscriptionProvider` 抽象
- 音频提取与 VAD
- 语言检测
- ASR 结果规范化与字幕分句
- 目录监控与自动化规则
- Telegram / 邮件 / Webhook 通知
- API Token / OpenAPI
- ASR 模型管理与硬件检测

### 3.3 明确不做

- 不把 Whisper 推理塞进 Nitro 主进程。
- 不在 Docker 镜像中内置大模型。
- 不默认上传音频到云端。
- 不在首版做说话人分离。
- 不在首版做完整 OCR 流水线；OCR 保留在来源优先级中，作为后续阶段。

---

## 4. 总体架构

```text
┌────────────────────────────────────────────┐
│                Nuxt / Nitro                │
│  文件浏览 · 任务创建 · 核对 · 设置 · 自动化  │
└───────────────────┬────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ SQLite 持久任务队列    │
        │ task_jobs / tasks      │
        └───────────┬───────────┘
                    │
       ┌────────────┴─────────────┐
       │                          │
       ▼                          ▼
  字幕来源判断                 目录监控
       │                          │
       ├── 文本字幕 → 现有流程     ├── chokidar
       ├── 外挂字幕 → 现有流程     ├── 文件稳定检测
       ├── OCR（后续）             └── 自动建任务
       └── ASR
             │
             ▼
  音频提取 FFmpeg
             │
             ▼
  VAD / 分段 / 语言检测
             │
             ▼
  ASR sidecar（本地优先）
  faster-whisper / whisper.cpp
             │
             ▼
  词级时间轴 / 分句 / 幻觉过滤
             │
             ▼
  现有翻译 Provider
             │
             ▼
  校验 / 核对 / Emby 兼容导出
             │
             ▼
  Telegram / 邮件 / Webhook 通知
```

---

## 5. ASR sidecar 设计

### 5.1 形态

独立 Python 服务，通过 HTTP 被 Nitro 调用。

推荐能力：

```text
GET  /health
GET  /models
POST /v1/audio/transcriptions
POST /admin/models/download
```

其中 `/v1/audio/transcriptions` 尽量兼容 OpenAI 音频转写接口，方便未来直接切换云服务。

### 5.2 引擎

| 引擎 | 用途 |
|---|---|
| faster-whisper | 默认主力，CPU int8 / GPU float16 |
| whisper.cpp | 低配 CPU、ARM NAS、无 Python 环境 |
| 云 ASR | OpenAI 兼容优先，低配兜底、可选、默认关闭 |

### 5.3 任务参数

```text
engine: auto | faster-whisper | whisper.cpp | cloud
model: small | medium | large-v3-turbo | large-v3
device: auto | cpu | cuda
computeType: int8 | float16
language: auto | en | ja | ko | zh | ru | fr | th | ...
vad: true
wordTimestamps: true
beamSize: 5
conditionOnPreviousText: false
noSpeechThreshold: 0.6
compressionRatioThreshold: 2.4
logprobThreshold: -1.0
```

### 5.4 本地模型管理

- 模型目录：`./data/models/asr`
- 不打包进主镜像。
- 支持 UI 下载、进度、校验、离线导入。
- 允许用户按需安装额外语言模型，不强制首版包含所有语言权重。
- 固定模型 revision，避免供应漂移。
- 模型预算：10–20GB。

---

## 6. 多语言策略

首批语言选择器覆盖：

- 英语（美式/英式）
- 日语
- 韩语
- 中文（简体/繁体）
- 俄语
- 法语
- 泰语
- 西班牙语
- 德语
- 意大利语
- 葡萄牙语

首版验收重点先放在英语、日语、韩语，其余语言保持可配置；不同语言模型可由用户后续按需安装。

| 语言 | 注意点 |
|---|---|
| 英语 | en-US / en-GB、大小写、缩写、英美拼写 |
| 日语 | 无空格、敬语、长句切分、汉字读音 |
| 韩语 | 分写、敬语、口语缩略 |
| 中文 | 简繁、标点、断句、同形异义 |
| 俄语 | 长词、格变化、人名转写 |
| 法语 | 重音符号、连读、省音 |
| 泰语 | 无空格、词边界、断行 |

语言检测：

- 优先整段音频检测，避免短片段误判。
- 混合语言按 segment 检测。
- 用户可固定源语言，减少误判。

---

## 7. ASR 流水线

### 7.1 媒体探测

扩展现有 `VideoService`：

```text
probeMedia(file)
  ├── duration
  ├── video streams
  ├── audio streams（codec / language / channels / default）
  ├── text subtitle streams
  └── bitmap subtitle streams
```

音频轨道选择优先级：

1. 用户指定音轨
2. default 音轨
3. 匹配源语言
4. 第一条可用音轨

### 7.2 字幕来源判断

`sourceMode=auto`：

```text
内嵌文本字幕
  > 同目录外挂字幕
  > OCR（后续）
  > ASR
```

有字幕时默认跳过 ASR；用户可强制 ASR。

### 7.3 音频提取

```bash
ffmpeg -i input.mkv -map 0:a:0 -vn -ac 1 -ar 16000 -c:a pcm_s16le temp.wav
```

- 16kHz 单声道。
- 可选 loudness normalize。
- 临时文件目录：`temp/asr/`。
- 保留策略可配置：
  - 任务结束立即删除（默认建议）
  - 保留 7 天
  - 保留 30 天
  - 自定义

### 7.4 VAD 与分段

- Silero VAD。
- 去除静音和纯音乐段。
- 控制单段时长，避免 Whisper 长音频退化。
- 保留时间轴。
- 无人声片段可选择不生成字幕或标记环境音。

### 7.5 ASR 与对齐

- `faster-whisper` 输出 segment + word timestamps。
- 可选 WhisperX / wav2vec2 强制对齐。
- 保存原始 JSON 和规范化 SRT。
- 保存模型、参数、耗时、RTF、置信度，便于复现。

### 7.6 字幕分句与规范化

- 按停顿、标点、最大时长切分。
- 单行长度：
  - CJK：15–18 字
  - 拉丁/俄语/法语/英语：约 42 字符
- 最短 1 秒，最长 6–8 秒。
- CPS 可读性控制。
- 合并过短句，拆分过长句。
- 去除重复 n-gram、片头片尾幻觉、无意义循环。
- 保留环境音括号描述。
- 可选说话人标签（后续）。

### 7.7 进入翻译

ASR 结果转换为现有 `SubtitleEntry`：

```text
id
startTime
endTime
text
sourceLanguage
asrConfidence
speaker?
```

复用：

- 分块
- 上下文
- 术语表
- 自定义风格
- Provider 翻译
- 校验
- 核对
- 导出

---

## 8. 质量与低错误率

### 8.1 音频

- 优先原语音轨。
- 适度 loudness normalize。
- 不建议强降噪。
- 音乐/爆炸声多时允许调整 VAD 阈值。

### 8.1.1 抗音乐/环境音增强（后续）

目标：音乐、爆炸声、环境音较重的影视片段中，提高人声可识别度。

候选方案：

- Demucs / htdemucs：人声分离
- UVR / MDX-Net：音乐与人声分离
- DeepFilterNet / RNNoise：轻量降噪
- ClearerVoice-Studio / FRCRN：语音增强
- 先 VAD + 轻降噪，再评估是否做人声分离，避免过度处理损伤对白

策略：

- 默认关闭，作为可选预处理档位。
- 根据设备能力决定是否启用：低配默认关闭，高配/GPU 可选。
- 先做 A/B 评测：原始音频 vs 轻降噪 vs 人声分离。
- 记录不同预处理对 CER/WER 和 RTF 的影响。
- 影视对白清晰时不要默认开启，避免引入伪影。
- 稳定性优先：预处理失败时自动回退原始音频。

### 8.2 幻觉控制

- `condition_on_previous_text=false`
- 压缩比、logprob、no_speech 阈值
- 重复句检测
- 片头片尾常见幻觉词过滤
- 静音段不强行生成
- 低置信度标记进入核对

### 8.3 翻译质量

- 检测源语言与目标语言。
- 中文简繁、日文汉字、韩文混用单独处理。
- 翻译后校验长度、串条、同源、异常重复。
- 低置信度 ASR 文本在核对页高亮。
- 可选双模型交叉校验（后续，按低置信度触发）。

### 8.4 说话人分离（后续）

目标：多人对话、群像剧、访谈中区分说话人，提升翻译指代和核对效率。

候选方案：

- pyannote.audio
- WhisperX diarization
- NVIDIA NeMo MSDD
- 3D-Speaker

策略：

- v1.6 做 PoC，v1.7+ 生产化。
- 默认关闭，按任务/媒体库开启；低配设备也允许用户手动开启。
- 需要额外模型和 GPU/CPU 资源，界面提示性能影响，但不强制禁用。
- 稳定性优先：分离失败时回退原始音频。
- 结果先用于核对页筛选和翻译上下文，不强制写入字幕。

### 8.5 质量指标

建立小样本集：

- 英语、日语、韩语、中文、俄语、法语、泰语
- 每语言 5–10 分钟带参考字幕片段
- 指标：
  - CER / WER
  - 时间轴偏移
  - 字幕 CPS
  - 翻译人工抽检通过率
  - RTF
  - 低置信度比例

---

## 9. Emby 兼容输出

### 9.1 默认命名

```text
{videoBase}.{targetLang}.srt
```

示例：

```text
Demo.Show.S01E01.zh-CN.srt
Demo.Show.S01E01.en.srt
```

### 9.2 语言与版本区分

- 语言使用标准代码：`zh-CN`、`zh-TW`、`en`、`ja`、`ko`、`ru`、`fr`、`th`。
- 单语/双语/仅原文通过输出设置区分。
- 不同版本规则：
  - 媒体目录只放一个 Emby 主字幕：`{base}.{lang}.srt`
  - 双语、不同模型、不同版本等变体统一放 `SubX/{base}.{lang}.{variant}.srt`
  - 可变体后缀：`bilingual`、`v2`、`model-{name}`
- 默认不把多个变体直接放进媒体目录，避免 Emby 同语言字幕选择混乱。

### 9.3 元数据

建议为每个输出记录：

```text
media path
source subtitle / ASR
source language
target language
ASR engine/model
confidence
prompt/style version
created_at
```

可选输出 `{base}.subx.json` 作为调试元数据，默认关闭。

---

## 10. 目录监控与自动化

### 10.1 监控目录

支持两种方式：

1. 新建独立监控目录。
2. 在现有媒体库上开启“监控此媒体库”。

UI 建议：

- 媒体库卡片上增加紧凑开关。
- 高级规则折叠，避免占用过多空间。
- 独立「自动化」页面查看事件、失败、重试。

### 10.2 触发规则

可配置：

- 文件扩展名
- 是否递归
- 包含/排除正则
- 最小文件大小
- 最大文件大小
- 最短视频时长
- 创建时间起止
- 修改时间起止
- 文件稳定等待时间
- 已有字幕是否跳过
- 已有输出是否跳过
- 只处理新文件 / 回填历史 / 两者
- 自动翻译目标语言
- 翻译 Provider / 风格 / 模板
- ASR 精度档位
- 输出模式
- 通知渠道
- 并发上限（监控自动任务默认 1）

### 10.3 幂等与防循环

- 文件稳定：大小和 mtime 连续两次不变。
- 忽略 `.part`、`.tmp`、`.download`、`.!qB`。
- 忽略 SubX 输出命名。
- 去重键：`root_id + relative_path + size + mtime`。
- 可选文件 hash。

### 10.4 回填历史

- 不默认扫描全库。
- 由用户手动指定目录和时间段。
- 按批次创建任务，避免一次性打满队列。
- 显示进度、暂停、取消、失败重试。
- 默认并发 1，可在设置中调整。

---

## 11. 通知

首批支持三类渠道：

### Telegram

- Bot Token（加密存储）
- Chat ID
- 可选代理地址
- 测试发送

### 邮件

- SMTP Host / Port
- TLS / SSL
- Username / Password（加密存储）
- From / To
- 测试发送

### Webhook

- URL
- Method
- Headers JSON
- 可选 HMAC 签名
- 测试发送

通知事件：

- 任务完成
- 任务失败
- 任务取消
- 低置信度超过阈值
- 监控目录异常
- 回填完成/失败

通知失败不阻塞主任务，进入重试队列。

后续可扩展：Matrix、Discord、ntfy、企业微信、Server 酱等；优先参考成熟开源通知网关，避免重复造轮子。

Apprise 评估：

- 只参考 Apprise 的通知适配设计，不直接集成，避免额外 sidecar 依赖。
- 借鉴其统一渠道抽象，保留自研轻量通知适配器。
- 先支持 Telegram、SMTP、ntfy、Webhook。

---

## 12. API 与外部接入

首批：

- REST API
- API Token（哈希存储、scope、过期时间）
- OpenAPI 文档
- 任务创建/查询/取消
- 监控目录管理
- 通知渠道测试

后续：

- Sonarr / Radarr / Jellyfin / Plex webhook
- Webhook 出站通知
- 只读/任务/管理权限

建议接口：

```text
GET  /api/asr/engines
GET  /api/asr/models
POST /api/asr/models/download
GET  /api/asr/status

POST /api/tasks
GET  /api/tasks/:id
POST /api/tasks/:id/cancel

GET  /api/watch-folders
POST /api/watch-folders
PATCH /api/watch-folders/:id
DELETE /api/watch-folders/:id
GET  /api/watch-events

POST /api/notification-channels/test
```

---

## 13. 数据模型

新增表：

```text
media_assets
  id, root_id, path, size, mtime, duration,
  audio_tracks_json, subtitle_tracks_json

transcription_runs
  id, task_id, engine, model, device, language,
  duration_ms, rtf, confidence, raw_json, created_at

asr_segments
  id, run_id, start_ms, end_ms, text, words_json,
  confidence, speaker, no_speech_prob

watch_folders
  id, root_id, path, enabled, recursive, mode,
  rules_json, output_policy_json

watch_events
  id, folder_id, path, size, mtime, status, task_id,
  error, created_at, updated_at

notification_channels
  id, type, name, config_json, enabled

notification_deliveries
  id, channel_id, event, status, attempts, last_error,
  created_at, updated_at
```

任务状态新增：

```text
probing
extracting_audio
transcribing
aligning
```

---

## 14. UI 规划

### 设置页新增「语音识别」Tab

- 引擎
- 模型
- 设备
- 计算精度
- 源语言
- VAD 阈值
- 词级时间轴
- 模型缓存目录
- 音频临时文件保留策略
- 云兜底开关（默认关闭）

### 首页

无文本字幕时显示：

> 未发现文本字幕，将使用语音识别生成字幕。

允许选择：

- 音频轨道
- 源语言
- 精度档位
- 是否翻译

### 任务详情

新增 ASR Tab：

- 音频提取进度
- 识别进度
- 识别语言
- 引擎/模型
- RTF
- 平均置信度
- 低置信度片段数量

### 核对页

- 置信度筛选
- 低置信度高亮
- 原始 ASR 文本 / 译文对照
- 后续可加音频片段回放

### 自动化页

- 监控目录列表
- 媒体库开关
- 最近事件
- 失败重试
- 规则编辑
- 通知渠道测试

---

## 15. 硬件与部署

### 目标硬件基线

第一版优先支持：

- 黑群晖：J4125 / N5105 / N100 / i3-8100 等常见 x86 低功耗平台。
- 矿机：N5105 / N100 / i3-8100 / i5-8400 等；GPU 仅作为可选加速。
- 不把 ARM 作为首版硬性目标；ARM 在 v1.6 通过 whisper.cpp 补上。

内存建议：

| 内存 | 可行方案 |
|---|---|
| 4–8GB | whisper.cpp small、faster-whisper small int8、云兜底 |
| 16GB | faster-whisper medium int8，日常推荐 |
| 32GB+ | large-v3-turbo、并发任务、后续说话人分离 |

GPU 说明：

- 首选 NVIDIA RTX 3060 12GB 或更高。
- P106-100 / RX 580 等矿卡不保证兼容，需单独验证驱动和推理后端。
- 无 GPU 时不要默认加载 large 模型，避免内存/速度不可用。

### 性能目标与基准

不设统一的“1 小时视频必须 X 分钟完成”硬指标，因为 NAS 硬件差异很大。
发布前对每个档位做实测，并给出参考：

```text
RTF = 处理耗时 / 音频时长
RTF 越小越好；RTF < 1 表示快于实时
```

建议发布时提供：

| 设备档位 | 引擎 | 模型 | RTF | 1 小时视频参考 | 内存/显存 |
|---|---|---|---|---|---|
| 低配 CPU | faster-whisper | small int8 | 实测 | 实测 | 实测 |
| 中配 CPU/iGPU | faster-whisper | medium int8 | 实测 | 实测 | 实测 |
| NVIDIA GPU | faster-whisper | large-v3-turbo fp16 | 实测 | 实测 | 实测 |
| ARM NAS | whisper.cpp | quantized | 实测 | 实测 | 实测 |

用户侧提供三档预设：

- **极速**：优先速度，允许准确率略降
- **均衡**：默认推荐
- **高精度**：优先准确率，耗时更长

### 硬件档位

| 档位 | 推荐模型 | 说明 |
|---|---|---|
| 低配 CPU | small / int8 | 可跑，速度慢 |
| 中配 CPU/iGPU | medium / int8 | 日常可用 |
| NVIDIA GPU | large-v3-turbo / float16 | 高精度、速度快 |
| 云兜底 | 云 ASR | 低配设备可选 |

### Docker 形态

推荐 Compose profile：

```text
subx              # Web/API/UI
subx-asr-cpu      # CPU ASR sidecar
subx-asr-gpu      # CUDA ASR sidecar
```

- 模型缓存：`./data/models/asr`
- 音频临时目录：`./data/temp/asr`
- GPU 需 NVIDIA Container Toolkit
- ARM NAS 优先 whisper.cpp 或云兜底
- 主镜像不包含模型

---

## 16. 安全与隐私

- 默认本地处理，不上传音频。
- 云 ASR 必须显式配置并开启。
- 音频临时文件默认任务结束删除。
- Telegram/邮件/Webhook 凭据加密存储。
- API Token 哈希存储。
- 通知和 Webhook 支持签名/重试。
- 任务日志不记录完整音频路径以外的敏感内容。
- 模型下载固定 revision 并校验。

---

## 17. 测试与验收

### 测试

- 音频提取 fixture
- VAD 分段 fixture
- 11 语言 ASR 基准样本
- 字幕分句/CPS 单元测试
- 幻觉过滤单元测试
- 任务状态与重启恢复测试
- 监控触发/幂等/防循环测试
- 通知渠道 mock 测试
- API Token/权限测试
- Playwright ASR 设置页、自动化页截图与 axe

### 验收目标

- 有文本字幕时绝不再跑 ASR。
- 无字幕视频可手动生成 SRT 并进入翻译/核对。
- 任务重启后可恢复。
- 监控目录不会重复触发。
- 低置信度片段可在核对页筛选。
- Emby 能识别默认输出字幕。
- 通知可配置、可测试、失败不阻塞主任务。

---

## 18. 路线图

### v1.4.0：手动 ASR MVP

- ASR sidecar 骨架
- 音频提取
- VAD
- faster-whisper
- 语言检测
- 字幕分句
- 任务状态
- 首页来源判断
- 设置页 ASR Tab
- 任务详情 ASR 信息
- 单元/集成测试

### v1.5.0：自动化与通知

- 监控目录
- 媒体库监控开关
- 过滤规则
- 历史回填
- 失败重试/通知
- Telegram / 邮件 / Webhook
- ntfy 优先扩展
- 自动化页
- API Token / OpenAPI

### v1.6.0：多引擎、云兜底、OCR 与音频增强 PoC

- whisper.cpp / ARM NAS
- 词级对齐增强
- OpenAI 兼容云 ASR 兜底（默认关闭）
- 云 ASR 扩展位保留；Azure/Google/豆包后续按需评估，不作为首阶段重点
- 音频片段回放
- OCR 基础能力（PGS/VobSub/DVD，优先中文/英文）
- 抗音乐/环境音增强 PoC
- 说话人分离 PoC
- 多语言基准与性能面板

### v1.7.0+：质量与生态扩展

- 说话人分离生产化
- 抗音乐/环境音增强生产化
- 双模型交叉校验
- OCR 语言/格式扩展
- Sonarr/Radarr/Jellyfin/Plex 集成
- 更多通知渠道
- 多 Worker / 多实例

---

## 19. 待确认细节

以下问题不影响当前方案启动，可在实施到对应阶段前确认：

1. 各硬件档位的实测 RTF 和可接受处理时间。
2. ntfy 之后的下一个通知渠道优先级。
3. OCR 在中文/英文之后的语言扩展顺序。

---

## 20. 交接说明

后续接手时按以下顺序阅读：

1. 本文档
2. `TODO.md`
3. `README.md`
4. `docs/deployment.md`
5. `docs/usage.md`
6. 代码入口：
   - `server/utils/video.ts`
   - `server/utils/task.ts`
   - `server/utils/translation.ts`
   - `server/utils/providers/`
   - `server/utils/db.ts`
   - `server/api/task.post.ts`
   - `server/api/tasks/[id].get.ts`
   - `app/pages/index.vue`
   - `app/components/FileBrowser.vue`
   - `app/pages/settings.vue`
   - `app/pages/task/[id].vue`
   - `app/pages/review/[id].vue`

开发原则：先改数据模型和接口，再改任务流水线，最后接入 UI；每个阶段必须有可回滚的 Feature Flag 和测试。


---

## 附录 A：参考开源项目与技术调研

> 原则：优先复用成熟项目，先做 PoC 和指标对比，再决定是否自研。

### ASR / 对齐 / VAD

- faster-whisper：CTranslate2 Whisper 推理
- whisper.cpp：轻量 CPU/ARM 推理
- WhisperX：词级对齐与 diarization
- stable-ts：时间轴稳定化
- Silero VAD：语音活动检测
- sherpa-onnx：离线 ASR / VAD / 标点
- FunASR / SenseVoice：中文与亚洲语言
- NVIDIA NeMo：英文/GPU 场景

### 音频增强 / 分离

- Demucs / htdemucs
- UVR / MDX-Net
- DeepFilterNet
- RNNoise
- ClearerVoice-Studio / FRCRN

### 说话人分离

- pyannote.audio
- WhisperX diarization
- NVIDIA NeMo MSDD
- 3D-Speaker

### OCR / 图形字幕

- PaddleOCR
- Tesseract
- EasyOCR
- pgsrip
- Subtitle Edit（PGS/VobSub 参考实现）

### 通知

- Apprise：统一通知适配层，覆盖 Telegram、邮件、ntfy、Matrix、Discord 等
- ntfy：轻量自托管推送
- 企业微信 / Server 酱 / Bark 等国内通知渠道

### 字幕同步 / 质量

- ffsubsync
- alass
- jiwer：WER/CER 评测
- COMET / sacrebleu（可选翻译质量评估）

### 云 ASR 调研

- OpenAI 兼容音频转写
- Azure Speech
- Google Speech
- 豆包 / 火山引擎（后续关注，不作为首阶段重点）
- Deepgram
- AssemblyAI
- 国内免费/低成本 ASR 服务保持关注，后续按隐私、配额、中文效果和 API 稳定性评估
