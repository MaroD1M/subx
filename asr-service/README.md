# SubX ASR Service

SubX 主镜像内置的语音识别服务，监听容器内 `127.0.0.1:8000`。不需要单独构建镜像或启动额外容器。

内置：

- faster-whisper（x86 默认）
- whisper.cpp / pywhispercpp（ARM 默认优先）
- Silero VAD、词级时间戳
- 模型下载管理：进度、速度、剩余时间、暂停、续传、取消、重试、卸载
- HTTP(S) 下载代理、Hugging Face 镜像站
- 可选 Demucs / DeepFilterNet 预处理
- 可选 pyannote 说话人分离

## 启动

主镜像的 `subx-start` 会自动启动本服务，用户无需手动操作。开发调试时可在本目录直接运行：

```bash
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

默认模型 `small`，CPU int8。可在 `.env` 或 Compose 中覆盖：

```env
ASR_MODEL=medium
ASR_DEVICE=cpu
ASR_COMPUTE_TYPE=int8
ASR_ENGINE=auto
ASR_PREPROCESS=off
ASR_AUTO_DOWNLOAD=false
ASR_HF_ENDPOINT=https://hf-mirror.com
ASR_DOWNLOAD_PROXY=http://127.0.0.1:7890
```

模型保存到 `/models`：

```text
/models/faster-whisper/<model>
/models/whisper-cpp/ggml-*.bin
/models/.subx-download-jobs.json
```

`ASR_AUTO_DOWNLOAD=false`（主镜像默认）时，未下载模型不会静默下载，任务会提示先到 SubX 设置页下载。

faster-whisper 与 whisper.cpp 模型下载都会在 Hugging Face 提供 sha256 元数据时进行校验，避免下载文件损坏后仍显示可用。

服务启动时默认会在后台线程中校验已有模型文件的 sha256（仅针对带 sha256 元数据的文件），校验结果缓存在对应 manifest 中，不会阻塞 ASR 启动。如不需要，可设置 `ASR_VERIFY_MODEL_CHECKSUMS=false` 关闭。没有 manifest 的手动放置模型无法自动校验，只能按文件存在性判断。

ARM NAS 可把 `ASR_ENGINE` 设为 `whisper-cpp`。

默认镜像不包含 Demucs、DeepFilterNet 和 pyannote，相关预处理默认关闭。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ASR_MODEL` | `small` | 默认模型；设置页可覆盖 |
| `ASR_DEVICE` | `auto` | `auto` / `cpu` / `cuda` |
| `ASR_COMPUTE_TYPE` | `int8` | `int8` / `float16` / `float32` |
| `ASR_ENGINE` | `auto` | `auto` / `faster-whisper` / `whisper-cpp` / `cloud` |
| `ASR_PREPROCESS` | `off` | `off` / `demucs` / `deepfilternet`；后两者默认镜像不包含 |
| `ASR_AUTO_DOWNLOAD` | `false` | 是否允许首次识别时静默下载模型 |
| `ASR_VERIFY_MODEL_CHECKSUMS` | `true` | 启动时在后台线程校验已有模型文件的 sha256（仅带元数据的文件），结果缓存到 manifest；设为 `false` 关闭 |
| `ASR_CHECKSUM_METADATA_RETRY_SECONDS` | `86400` | 后台校验需要从 Hugging Face 获取缺失的 sha256 元数据但请求失败时，失败时间会记录在 manifest 中；默认 86400 秒（1 天）后才重试，避免启动时反复请求和刷日志 |
| `ASR_MODEL_DIR` | `/models` | 模型缓存根目录 |
| `ASR_WHISPER_CPP_MODEL_DIR` | `/models/whisper-cpp` | whisper.cpp 模型目录 |
| `ASR_AVAILABLE_MODELS` | `tiny,base,small,medium,large-v3,large-v3-turbo` | 设置页可下载模型列表 |
| `ASR_WHISPER_CPP_MODELS` | 同 `ASR_AVAILABLE_MODELS` | whisper.cpp 可选模型列表 |
| `ASR_THREADS` | `0` | whisper.cpp 推理线程数；0 表示 CPU 核心数 |
| `ASR_MODEL_CACHE_SIZE` | 内存自适应：`<16GB` 为 `1`，`>=16GB` 为 `2` | 同时驻留内存的模型数量上限；切换模型时自动淘汰旧模型，避免 NAS 内存不足 |
| `ASR_MAX_JOBS` | `100` | 内存中保留的识别任务数量上限；长时间音频较多时可调小 |
| `ASR_JOB_RETENTION_SECONDS` | `86400` | 已完成任务在内存中的保留时间（秒） |
| `ASR_DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | 说话人分离模型；默认镜像不包含 pyannote |
| `HF_TOKEN` | 空 | 外部自定义说话人分离服务需要的 Hugging Face Token |
| `ASR_DOWNLOAD_PROXY` | 空 | 模型下载默认 HTTP(S) 代理 |
| `ASR_HF_ENDPOINT` | `https://huggingface.co` | Hugging Face 镜像站 |
| `ASR_API_KEY` | 空 | 可选服务鉴权；主镜像下优先于设置页保存的 Key |

## API

```text
GET  /health
GET  /models
POST /v1/audio/transcriptions
POST /v1/audio/transcriptions/jobs
GET  /v1/audio/transcriptions/jobs/{job_id}
POST /v1/audio/transcriptions/jobs/{job_id}/cancel
POST /models/download
GET  /models/download/{job_id}
POST /models/download/{job_id}/pause
POST /models/download/{job_id}/resume
POST /models/download/{job_id}/cancel
POST /models/delete
```

`/v1/audio/transcriptions` 接收 multipart：

- `file`：音频文件
- `model`：模型名
- `language`：`auto` 或语言代码
- `device`：`auto` / `cpu` / `cuda`；覆盖服务端默认设备
- `compute_type`：`int8` / `float16` / `float32`；覆盖服务端默认精度
- `engine`：`auto` / `faster-whisper` / `whisper-cpp`
- `vad`：`true` / `false`
- `word_timestamps`：`true` / `false`
- `preprocess`：`off` / `demucs` / `deepfilternet`
- `diarize`：`true` / `false`

返回 `language`、`duration`、`rtf`、`segments`、词级时间轴和可选 `speaker`。

### 进度任务

长音频推荐使用任务接口。`POST /v1/audio/transcriptions/jobs` 接收与同步接口相同的 multipart 字段，立即返回：

```json
{ "jobId": "asrjob_xxx", "status": "queued" }
```

随后轮询 `GET /v1/audio/transcriptions/jobs/{job_id}`：

```json
{ "jobId": "asrjob_xxx", "status": "running", "progress": 45, "message": "正在识别 45/100" }
```

完成后 `status` 为 `done`，`result` 与同步接口返回结构一致；失败时为 `error` 并带 `error`。识别期间可调用 `POST /v1/audio/transcriptions/jobs/{job_id}/cancel` 取消。已完成任务默认保留 24 小时，最多保留 100 个任务。

## 模型下载管理

`POST /models/download` 接收 multipart：

- `model`：模型名，例如 `small`、`large-v3-turbo`
- `engine`：`auto` / `faster-whisper` / `whisper-cpp`
- `proxy`：可选 HTTP(S) 代理
- `force`：已安装时是否强制重新校验

任务状态：

```text
queued → downloading → ready
                    ↘ paused → downloading
                    ↘ error → resume
                    ↘ cancelled
```

状态字段包括：

- `downloaded` / `total` / `percent`
- `speed`（bytes/s）/ `etaSeconds`
- `filesDone` / `filesTotal` / `currentFile`
- `message` / `error`
- `proxyConfigured`

下载使用 `.part` 文件和 HTTP Range 断点续传。暂停/取消通过后台事件中止，已下载部分保留；取消会清理该模型目录。任务元数据持久化在 `/models/.subx-download-jobs.json`，容器重启后活动任务会显示为已暂停。

当模型目录名称与其他模型发生冲突时，会自动添加短哈希后缀重命名，不再阻止多个模型共存。升级前已存在的旧目录仍会被识别为已安装，删除模型时会一并清理新旧目录。

自动重命名变更前创建的暂停下载任务，会在 ASR 服务启动时从旧版模型目录迁移到新的哈希目录，且只迁移一次；已下载的部分和 `.part` 文件会保留。若新目录已存在或迁移失败，任务会继续保留在旧路径并给出警告，而不会被丢弃。

代理只支持 `http://` / `https://`。未显式配置代理时会读取标准 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`。Hugging Face 镜像可通过 `ASR_HF_ENDPOINT` 或 `HF_ENDPOINT` 设置。
