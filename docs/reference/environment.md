# 环境变量参考

> 适用版本：v2.11.0
>
> 完整默认值同时以根目录 [`.env.example`](../../.env.example) 和 [`docker-compose.yml`](../../docker-compose.yml) 为准。

> 根目录 [`docker-compose.yml`](../../docker-compose.yml) 已对每个变量和主要 Compose 参数逐项注释；下表是完整参考。`NODE_ENV`、`PG_TEST_DATABASE_URL` 属于内部/测试变量，不建议手动设置。

**先记这几个就够用：**

- `VIDEO_DIR` / 媒体卷：告诉 SubX 片子在哪儿。
- `PUID` / `PGID`：保证容器读得动你的媒体文件。
- `SUBX_SECRET_KEY`：给 API Key 上锁，强烈建议设置。
- `ASR_MODEL`：先 `small`，够用再考虑 `medium`。
- `ASR_AUTO_DOWNLOAD`：单镜像保持 `false`，去设置页手动下载。
- `ASR_DOWNLOAD_PROXY` / `ASR_HF_ENDPOINT`：模型下载慢或连不上时再用。
- `OCR_*`：只有图像字幕效果不理想时再调，默认值很稳。

> 主镜像已经内置 ASR 和 OCR，正常部署不需要额外镜像、服务或外部地址。

## 主镜像 / Web / 内部服务

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VIDEO_DIR` | `/media` | 默认媒体目录；未配置媒体库时作为回退 |
| `DB_PATH` | `/app/db/subx.db` | SQLite 数据库路径；设置 `DATABASE_URL` 后不生效 |
| `SUBX_BACKUP_DIR` | `/app/backups` | 应用内备份目录；Compose 默认映射到 `./data/backups` |
| `SUBX_SECRET_KEY` | 自动生成 | API Key 加密主密钥；未设置时自动生成 `db/.secret`；更换后旧 Key 需重填 |
| `TZ` | `Asia/Shanghai` | 容器时区；界面时间、任务日志和通知均按此时区显示 |
| `PUID` / `PGID` | `1001` | 容器运行用户；建议与媒体所有者一致 |
| `CHOWN_MEDIA` | `false` | 启动时递归修复媒体目录权限；大目录会较慢 |
| `CHOWN_MODELS` | `false` | 启动时递归修复 `/models` 权限；从旧拆分部署迁移时可用 |
| `RUN_AS_ROOT` | `false` | 跳过降权直接以 root 运行；仅排障，不推荐 |
| `TRUST_PROXY` | 空 | 位于可信反向代理后设为 `true` |
| `SUBX_ALLOWED_ORIGINS` | 空 | 额外允许的跨域来源，逗号分隔 |
| `SUBX_AI_LOG_FULL_PAYLOAD` | 空 | 设为 `1` 时记录完整 AI 请求/响应正文；仅排障时临时开启 |
| `FFMPEG_PATH` | 自动 | 自定义 ffmpeg 路径；容器内通常不需要 |
| `FFPROBE_PATH` | 自动 | 自定义 ffprobe 路径；容器内通常不需要 |
| `SUBX_ALL_IN_ONE` | 镜像内 `true` | 单镜像标记；自动把旧外部服务默认地址迁移到 `127.0.0.1` |
| `SUBX_KEEP_LEGACY_SIDECAR_URLS` | `false` | 仅旧拆分部署升级时使用；保留旧的外部 ASR/OCR 地址，不自动迁移 |
| `ASR_INTERNAL_PORT` | `8000` | 内置 ASR 监听端口（仅回环）；启动脚本自动生成 URL |
| `OCR_INTERNAL_PORT` | `8001` | 内置 OCR 监听端口（仅回环）；启动脚本自动生成 URL |
| `ASR_INTERNAL_URL` | `http://127.0.0.1:8000` | 显式覆盖主应用默认 ASR 地址；一般不需要 |
| `OCR_INTERNAL_URL` | `http://127.0.0.1:8001` | 显式覆盖主应用默认 OCR 地址；一般不需要 |
| `ASR_API_KEY` / `OCR_API_KEY` | 空 | 内置服务可选鉴权；单镜像下环境变量优先于设置页保存值，外部服务时设置页保存值优先 |
| `ASR_MAX_CHUNKS` | `500` | 单次音频最多分段数；超过后明确报错，不再静默截断 |
| `ASR_POLL_RETRIES` / `OCR_POLL_RETRIES` | `3` | 状态轮询遇到瞬时网络错误时的连续重试次数 |
| `ASR_POLL_MS` / `OCR_POLL_MS` | `1500` | 主应用轮询 ASR / OCR 任务状态的间隔（毫秒）；高级参数 |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | 空 | 通知出站和模型下载的默认代理；渠道里单独填的代理优先 |
| `NO_PROXY` | 空 | 不走代理的地址，逗号分隔，例如 `localhost,127.0.0.1` |

## ASR 变量

主镜像内置 ASR 与外部自定义服务共用这些变量。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ASR_MODEL_DIR` | `/models` | 模型缓存根目录；必须与 `/models` 卷对应 |
| `ASR_WHISPER_CPP_MODEL_DIR` | `/models/whisper-cpp` | whisper.cpp 模型目录 |
| `ASR_AUTO_DOWNLOAD` | `false` | 是否允许首次识别时静默下载；建议保持 `false`，在设置页手动下载 |
| `ASR_DOWNLOAD_PROXY` | 空 | 模型下载默认 HTTP(S) 代理；未设置时读取容器 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` |
| `ASR_HF_ENDPOINT` | `https://huggingface.co` | Hugging Face 镜像站，例如 `https://hf-mirror.com` |
| `ASR_MODEL` | `small` | 默认模型；设置页可覆盖 |
| `ASR_DEVICE` | `auto` | `auto` / `cpu` / `cuda`；主镜像为 CPU 版，`cuda` 仅外部自定义服务可用 |
| `ASR_COMPUTE_TYPE` | `int8` | `int8` / `float16` / `float32`；CPU 推荐 int8，GPU 推荐 float16 |
| `ASR_ENGINE` | `auto` | `auto` / `faster-whisper` / `whisper-cpp` / `cloud` |
| `ASR_PREPROCESS` | `off` | `off` / `demucs` / `deepfilternet`；后两者默认镜像不包含，外部自定义服务可用 |
| `ASR_AVAILABLE_MODELS` | `tiny,base,small,medium,large-v3,large-v3-turbo` | 设置页可下载模型列表 |
| `ASR_WHISPER_CPP_MODELS` | 同 `ASR_AVAILABLE_MODELS` | whisper.cpp 可选模型列表 |
| `ASR_THREADS` | `0` | whisper.cpp 推理线程数；0 表示使用 CPU 核心数 |
| `ASR_MODEL_CACHE_SIZE` | 内存自适应：`<16GB` 为 `1`，`>=16GB` 为 `2` | 同时驻留内存的模型数量上限；切换模型时自动淘汰旧模型 |
| `ASR_MAX_JOBS` | `100` | 内存中保留的识别任务数量上限；长时间音频较多时可调小 |
| `ASR_JOB_RETENTION_SECONDS` | `86400` | 已完成任务在内存中的保留时间（秒） |
| `ASR_VERIFY_MODEL_CHECKSUMS` | `true` | 启动时后台校验已有模型文件 sha256；结果缓存到 manifest，不阻塞启动 |
| `ASR_CHECKSUM_METADATA_RETRY_SECONDS` | `86400` | 后台补取 sha256 元数据失败后的重试间隔（秒），避免反复请求 HF |
| `ASR_AUDIO_CACHE_DAYS` | `14` | 提取音频缓存保留天数（最小 7 天）；缓存位于 `/app/temp/asr-audio` |
| `ASR_CHUNK_SECONDS` | `300` | ASR 分段时长（秒）；设置页「分段与断点」可覆盖 |
| `ASR_CHUNK_OVERLAP_SECONDS` | `2` | 分段重叠时长（秒），避免切断对白 |
| `ASR_RESUME_TTL_HOURS` | `168` | 分段检查点保留时间（小时） |
| `ASR_POLL_MS` | `1500` | 主应用轮询 ASR 任务进度的间隔（毫秒），高级参数 |
| `ASR_UPLOAD_TIMEOUT_MS` | `1800000` | 音频上传/任务创建超时（毫秒），默认 30 分钟 |
| `ASR_POLL_TIMEOUT_MS` | `30000` | 单次 ASR 状态请求超时（毫秒） |
| `ASR_JOB_IDLE_TIMEOUT_MS` | `1800000` | 任务长时间没有进度时中止（毫秒），默认 30 分钟 |
| `ASR_JOB_ABSOLUTE_TIMEOUT_MS` | `21600000` | 单个 ASR 任务最长执行时间（毫秒），默认 6 小时 |
| `ASR_DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | 说话人分离模型；仅外部自定义服务可用 |
| `HF_TOKEN` | 空 | Hugging Face Token；仅外部自定义说话人分离服务需要 |

## OCR 变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OCR_MEDIA_ROOT` | `/media` | OCR 可访问的媒体根目录；必须与主应用挂载路径一致 |
| `OCR_LANGUAGE` | `en` | 默认 OCR 语言，例如 `en` / `zh-CN` / `ja` |
| `OCR_ENGINE` | `auto` | `auto` / `rapidocr` / `tesseract` |
| `OCR_FPS` | `2` | 抽帧 OCR 帧率；低配 NAS 可降到 `1` |
| `OCR_WORKERS` | `4` | 并行 OCR 线程数；低配可降到 `2` |
| `OCR_MIN_CONFIDENCE` | `25` | 低置信度提示阈值（0–100），结果保留并进入核对 |
| `OCR_MAX_SECONDS` | `14400` | OCR 最大视频时长；默认 4 小时，设置页可覆盖 |
| `OCR_CHUNK_SECONDS` | `1800` | VobSub/DVD 分段时长；默认 30 分钟，设置页可覆盖 |
| `OCR_PGSRIP_TIMEOUT_SECONDS` | `7200` | pgsrip 单次识别超时；默认 2 小时，设置页可覆盖 |
| `OCR_FFMPEG_TIMEOUT_SECONDS` | `3600` | 单段抽帧/字幕提取超时；设置页可覆盖 |
| `OCR_CHUNK_RETRIES` | `1` | 单段失败重试次数；设置页可覆盖 |
| `OCR_RESUME_TTL_HOURS` | `24` | OCR 分段断点保留时间；设置页可覆盖 |
| `OCR_MAX_CONCURRENT_JOBS` | `2` | 同时运行的 OCR 任务上限；低配 NAS 建议 `1` |
| `OCR_JOB_RETENTION_SECONDS` | `3600` | 已完成 OCR 任务在内存中的保留时间（秒） |
| `OCR_JOB_IDLE_TIMEOUT_MS` | `3600000` | 主应用 OCR 无进度超时；设置页可覆盖 |
| `OCR_JOB_ABSOLUTE_TIMEOUT_MS` | `21600000` | 主应用 OCR 总任务上限；设置页可覆盖 |
| `OCR_TEMP_DIR` | `/app/temp/ocr` | OCR 抽帧临时目录；默认位于主应用 `./data/temp/ocr` 下 |
| `OCR_MAX_JOBS` | `50` | OCR 内存任务队列上限；超过时清理已结束任务，仍满则返回 429 |

> 以上环境变量用于新实例默认值。设置页「图像字幕 OCR → 长视频与超时」保存后会随每个 OCR 请求下发，优先于容器环境变量，无需重启 OCR 服务。

## 数据库 / 多 Worker

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 空 | PostgreSQL 连接串；设置后优先于 `DB_PATH` |
| `PG_POOL_SIZE` | `5` | PostgreSQL 连接池大小；同步桥为低并发设计 |
| `POSTGRES_USER` | `subx` | PostgreSQL 用户名；需与 `DATABASE_URL` 一致 |
| `POSTGRES_PASSWORD` | `subx` | PostgreSQL 密码；生产环境请修改 |
| `POSTGRES_DB` | `subx` | PostgreSQL 数据库名；需与 `DATABASE_URL` 一致 |
| `SUBX_WORKER_ID` | 进程 PID | 单主机多 Worker / 多实例标识 |
| `SUBX_WORKER_STALE_SECONDS` | `120` | 回收陈旧任务的超时时间（秒） |

## 内部 / 测试变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 运行时环境；镜像已设置，不建议修改 |
| `PG_TEST_DATABASE_URL` | 空 | 仅 PostgreSQL 测试使用，不用于生产 |

> 主镜像已内置 ASR/OCR，通常无需设置外部地址。外接自定义 ASR/OCR 服务时，`ASR_*` / `OCR_*` 变量同样适用；模型目录和媒体挂载必须一致。完整 Compose 示例和逐项注释以根目录 `docker-compose.yml` 为准。

---

## 相关文档

- [部署文档](../deployment.md)
- [运维与数据管理](../operations.md)
- [升级与回滚](upgrade.md)
