# SubX ASR Service

本地语音识别服务。v2.5.0 起默认运行在 SubX 单镜像内部（`127.0.0.1:8000`），也支持独立 sidecar 部署。

内置：

- faster-whisper（x86 默认）
- whisper.cpp / pywhispercpp（ARM 默认优先）
- Silero VAD、词级时间戳
- 模型下载管理：进度、速度、剩余时间、暂停、续传、取消、重试、卸载
- HTTP(S) 下载代理、Hugging Face 镜像站
- 可选 Demucs / DeepFilterNet 预处理
- 可选 pyannote 说话人分离

## 启动

单镜像部署不需要单独启动本服务。拆分部署时：

```bash
docker compose --profile asr up -d asr
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

`ASR_AUTO_DOWNLOAD=false`（单镜像默认）时，未下载模型不会静默下载，任务会提示先到 SubX 设置页下载。独立 sidecar 默认允许自动下载，可按需覆盖。

ARM NAS 可把 `ASR_ENGINE` 设为 `whisper-cpp`；增强镜像：

```bash
docker compose --profile asr-enhanced up -d asr-enhanced
```

增强镜像包含 Demucs、DeepFilterNet、pyannote，体积较大，默认关闭。说话人分离需要 `HF_TOKEN` 和 pyannote 模型许可。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ASR_MODEL` | `small` | 默认模型；设置页可覆盖 |
| `ASR_DEVICE` | `auto` | `auto` / `cpu` / `cuda` |
| `ASR_COMPUTE_TYPE` | `int8` | `int8` / `float16` / `float32` |
| `ASR_ENGINE` | `auto` | `auto` / `faster-whisper` / `whisper-cpp` / `cloud` |
| `ASR_PREPROCESS` | `off` | `off` / `demucs` / `deepfilternet`；后两者仅 enhanced 镜像 |
| `ASR_AUTO_DOWNLOAD` | 单镜像 `false`；sidecar `true` | 是否允许首次识别时静默下载模型 |
| `ASR_MODEL_DIR` | `/models` | 模型缓存根目录 |
| `ASR_WHISPER_CPP_MODEL_DIR` | `/models/whisper-cpp` | whisper.cpp 模型目录 |
| `ASR_AVAILABLE_MODELS` | `tiny,base,small,medium,large-v3,large-v3-turbo` | 设置页可下载模型列表 |
| `ASR_WHISPER_CPP_MODELS` | 同 `ASR_AVAILABLE_MODELS` | whisper.cpp 可选模型列表 |
| `ASR_THREADS` | `0` | whisper.cpp 推理线程数；0 表示 CPU 核心数 |
| `ASR_DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | 说话人分离模型；仅 enhanced |
| `HF_TOKEN` | 空 | 说话人分离/受许可模型需要的 Hugging Face Token |
| `ASR_DOWNLOAD_PROXY` | 空 | 模型下载默认 HTTP(S) 代理 |
| `ASR_HF_ENDPOINT` | `https://huggingface.co` | Hugging Face 镜像站 |
| `ASR_API_KEY` | 空 | 可选服务鉴权；主镜像设置后会自动作为默认 Key 使用 |

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

代理只支持 `http://` / `https://`。未显式配置代理时会读取标准 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`。Hugging Face 镜像可通过 `ASR_HF_ENDPOINT` 或 `HF_ENDPOINT` 设置。
