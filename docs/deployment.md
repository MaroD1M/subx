# SubX 部署文档

> 适用版本：v2.6.2

本文档覆盖单镜像部署、NAS、镜像与模型下载、反向代理、拆分部署、升级备份和常见问题。使用说明请参阅 [usage.md](usage.md)。仓库根目录的 [`docker-compose.yml`](../docker-compose.yml) 是带完整注释的模板。

## 1. v2.6.2 架构

从 v2.5.0 开始，主应用镜像 `ghcr.io/marod1m/subx` 同时包含：

- Nuxt / Nitro Web 应用（端口 `3000`）
- 本地 ASR 服务（容器内 `127.0.0.1:8000`，faster-whisper / whisper.cpp）
- 本地 OCR 服务（容器内 `127.0.0.1:8001`，Tesseract / RapidOCR）

内部 ASR/OCR 只监听回环地址，不对外暴露端口。默认只需要一个 `subx` 容器。

Whisper 模型体积较大且与硬件相关，**不打进镜像**。首次进入「设置 → 语音识别 → 本地模型管理」手动开始下载，支持进度、速度、剩余时间、暂停、续传、取消、重试、卸载、代理和 Hugging Face 镜像站。

OCR 使用镜像内置的 Tesseract 语言包和 RapidOCR，不需要额外下载模型。

拆分部署的 `subx-asr`、`subx-ocr`、增强版和 GPU 版 sidecar 仍然保留，见第 8 节。

## 2. Docker Compose 快速部署

```yaml
services:
  subx:
    image: ghcr.io/marod1m/subx:v2.6.2
    container_name: subx
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: Asia/Shanghai
      VIDEO_DIR: /media
      DB_PATH: /app/db/subx.db
      PUID: 1001
      PGID: 1001
      SUBX_ALL_IN_ONE: "true"
      ASR_AUTO_DOWNLOAD: "false"
      # 推荐设置，用于加密 API Key
      # SUBX_SECRET_KEY: change-me-to-a-long-random-secret
    volumes:
      - /path/to/your/media:/media
      - ./data/db:/app/db
      - ./data/temp:/app/temp
      - ./data/models:/models
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 60s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

启动：

```bash
docker compose up -d
```

访问：

```text
http://<主机IP>:3000
```

首次进入先设置访问口令，然后：

1. 在「媒体库」添加容器内路径，例如 `/media`。
2. 执行路径检测，确认挂载和权限正常。
3. 进入「设置 → 语音识别 → 本地模型管理」下载 Whisper 模型。
4. 需要无字幕识别时开启「启用语音识别」；需要图像字幕时开启「图像字幕 OCR」。
5. 回首页开始翻译。

> 单镜像实测（v2.6.2，不含模型）：amd64 下载约 **586 MiB**，解压后文件约 **1.57 GiB**（磁盘约 1.6–1.8 GB）；arm64 下载约 **520 MiB**。模型体积参考：`tiny` 约 75MB、`small` 约 500MB、`medium` 约 1.5GB、`large-v3` 约 3GB。建议为 `./data/models` 预留 10–20GB。

> [!TIP]
> 不想读全文？先只改三处：媒体路径、`PUID/PGID`、`SUBX_SECRET_KEY`。然后 `docker compose up -d`，进设置页下载模型。其他默认值先别动，真的够用。

### 2.1 Compose 结构与参数说明

根目录 [`docker-compose.yml`](../docker-compose.yml) 已逐项注释，默认只启动 `subx` 服务：

| 配置段 | 作用 | 注意 |
| --- | --- | --- |
| `ports` | 暴露 Web 端口 `3000` | 内置 ASR/OCR 只监听 `127.0.0.1:8000/8001`，不要额外映射端口 |
| `volumes` | 媒体、数据库、临时文件、模型缓存 | `./data/models` 建议预留 10–20GB；媒体只读时无法输出字幕 |
| `environment` | 基础、内置服务、ASR、OCR、数据库、Worker、反代 | 完整变量见第 4 节 |
| `healthcheck` | 检查 `/api/health` | 首次启动 60 秒宽限期 |
| `mem_limit` / `cpus` | 单镜像资源限制 | 默认 4GB/4 核，使用 medium/large 模型时按机器上调 |
| `logging` | 限制容器日志大小 | 默认单文件 10MB、最多 3 个 |
| `profiles` | 可选 PostgreSQL / sidecar | 默认不启用；单镜像不需要 ASR/OCR profile |

可选服务：

- `postgres`：`--profile postgres`，启用 PostgreSQL。
- `asr`：`--profile asr`，拆分 CPU ASR sidecar。
- `asr-enhanced`：`--profile asr-enhanced`，Demucs / DeepFilterNet / pyannote。
- `ocr`：`--profile ocr`，拆分 OCR sidecar。
- `asr-gpu`：`--profile asr-gpu`，NVIDIA GPU ASR。

## 3. 多媒体库模式与 NAS 路径

```yaml
services:
  subx:
    image: ghcr.io/marod1m/subx:v2.6.2
    container_name: subx
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: Asia/Shanghai
      VIDEO_DIR: /media/movies
      DB_PATH: /app/db/subx.db
      PUID: 1001
      PGID: 1001
      SUBX_ALL_IN_ONE: "true"
      ASR_AUTO_DOWNLOAD: "false"
    volumes:
      - /volume1/movies:/media/movies
      - /volume1/tv:/media/tv
      - /volume2/anime:/media/anime
      - ./data/db:/app/db
      - ./data/temp:/app/temp
      - ./data/models:/models
```

配置后在「媒体库」页面添加容器内路径：

- `/media/movies`
- `/media/tv`
- `/media/anime`

注意：

- 页面填写的是**容器内路径**，不是宿主机路径。
- 内置 OCR 与主应用共享同一个 `/media`，不需要额外挂载。
- 多媒体库模式下仍建议保留一个有效的 `VIDEO_DIR` 作为回退。
- 首页提示媒体库不可访问时，优先检查卷挂载、目录权限和路径拼写。

群晖：

```yaml
volumes:
  - /volume1/video:/media
  - /volume1/docker/subx/db:/app/db
  - /volume1/docker/subx/temp:/app/temp
  - /volume1/docker/subx/models:/models
```

Unraid：

```yaml
volumes:
  - /mnt/user/Media:/media
  - /mnt/user/appdata/subx/db:/app/db
  - /mnt/user/appdata/subx/temp:/app/temp
  - /mnt/user/appdata/subx/models:/models
```

## 4. 环境变量与参数

> 根目录 [`docker-compose.yml`](../docker-compose.yml) 已对每个变量和主要 Compose 参数逐项注释；下表是完整参考。`NODE_ENV`、`PG_TEST_DATABASE_URL` 属于内部/测试变量，不建议手动设置。

**先记这几个就够用：**

- `VIDEO_DIR` / 媒体卷：告诉 SubX 片子在哪儿。
- `PUID` / `PGID`：保证容器读得动你的媒体文件。
- `SUBX_SECRET_KEY`：给 API Key 上锁，强烈建议设置。
- `ASR_MODEL`：先 `small`，够用再考虑 `medium`。
- `ASR_AUTO_DOWNLOAD`：单镜像保持 `false`，去设置页手动下载。
- `ASR_DOWNLOAD_PROXY` / `ASR_HF_ENDPOINT`：模型下载慢或连不上时再用。
- `OCR_*`：只有图像字幕效果不理想时再调，默认值很稳。

### 4.1 主镜像 / Web / 内部服务

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VIDEO_DIR` | `/media` | 默认媒体目录；未配置媒体库时作为回退 |
| `DB_PATH` | `/app/db/subx.db` | SQLite 数据库路径；设置 `DATABASE_URL` 后不生效 |
| `SUBX_SECRET_KEY` | 自动生成 | API Key 加密主密钥；未设置时自动生成 `db/.secret`；更换后旧 Key 需重填 |
| `TZ` | `Asia/Shanghai` | 容器时区 |
| `PUID` / `PGID` | `1001` | 容器运行用户；建议与媒体所有者一致 |
| `CHOWN_MEDIA` | `false` | 启动时递归修复媒体目录权限；大目录会较慢 |
| `CHOWN_MODELS` | `false` | 启动时递归修复 `/models` 权限；从旧 sidecar 迁移时可用 |
| `RUN_AS_ROOT` | `false` | 跳过降权直接以 root 运行；仅排障，不推荐 |
| `TRUST_PROXY` | 空 | 位于可信反向代理后设为 `true` |
| `SUBX_ALLOWED_ORIGINS` | 空 | 额外允许的跨域来源，逗号分隔 |
| `FFMPEG_PATH` | 自动 | 自定义 ffmpeg 路径；容器内通常不需要 |
| `FFPROBE_PATH` | 自动 | 自定义 ffprobe 路径；容器内通常不需要 |
| `SUBX_ALL_IN_ONE` | 镜像内 `true` | 单镜像标记；自动把旧 sidecar 默认地址迁移到 `127.0.0.1` |
| `SUBX_KEEP_LEGACY_SIDECAR_URLS` | `false` | 保留旧的 `subx-asr` / `subx-ocr` 地址，不自动迁移 |
| `ASR_INTERNAL_PORT` | `8000` | 内置 ASR 监听端口（仅回环）；启动脚本自动生成 URL |
| `OCR_INTERNAL_PORT` | `8001` | 内置 OCR 监听端口（仅回环）；启动脚本自动生成 URL |
| `ASR_INTERNAL_URL` | `http://127.0.0.1:8000` | 显式覆盖主应用默认 ASR 地址；一般不需要 |
| `OCR_INTERNAL_URL` | `http://127.0.0.1:8001` | 显式覆盖主应用默认 OCR 地址；一般不需要 |
| `ASR_API_KEY` / `OCR_API_KEY` | 空 | 内置服务可选鉴权；设置后需在设置页填写相同 Key，通常仅回环无需开启 |
| `OCR_POLL_MS` | `1500` | 主应用轮询 OCR 任务状态的间隔（毫秒）；高级参数 |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | 空 | 通知出站和模型下载的默认代理；渠道里单独填的代理优先 |
| `NO_PROXY` | 空 | 不走代理的地址，逗号分隔，例如 `localhost,127.0.0.1` |

### 4.2 ASR 变量

单镜像与独立 `subx-asr` / `subx-asr-gpu` / `subx-asr-enhanced` 共用这些变量。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ASR_MODEL_DIR` | `/models` | 模型缓存根目录；必须与 `/models` 卷对应 |
| `ASR_WHISPER_CPP_MODEL_DIR` | `/models/whisper-cpp` | whisper.cpp 模型目录 |
| `ASR_AUTO_DOWNLOAD` | 单镜像 `false`；sidecar `true` | 是否允许首次识别时静默下载；单镜像建议保持 `false` |
| `ASR_DOWNLOAD_PROXY` | 空 | 模型下载默认 HTTP(S) 代理；未设置时读取容器 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` |
| `ASR_HF_ENDPOINT` | `https://huggingface.co` | Hugging Face 镜像站，例如 `https://hf-mirror.com` |
| `ASR_MODEL` | `small` | 默认模型；设置页可覆盖 |
| `ASR_DEVICE` | `auto` | `auto` / `cpu` / `cuda`；单镜像为 CPU 版，`cuda` 仅用于 GPU sidecar |
| `ASR_COMPUTE_TYPE` | `int8` | `int8` / `float16` / `float32`；CPU 推荐 int8，GPU 推荐 float16 |
| `ASR_ENGINE` | `auto` | `auto` / `faster-whisper` / `whisper-cpp` / `cloud` |
| `ASR_PREPROCESS` | `off` | `off` / `demucs` / `deepfilternet`；后两者仅 enhanced sidecar，单镜像会回退原始音频 |
| `ASR_AVAILABLE_MODELS` | `tiny,base,small,medium,large-v3,large-v3-turbo` | 设置页可下载模型列表 |
| `ASR_WHISPER_CPP_MODELS` | 同 `ASR_AVAILABLE_MODELS` | whisper.cpp 可选模型列表 |
| `ASR_THREADS` | `0` | whisper.cpp 推理线程数；0 表示使用 CPU 核心数 |
| `ASR_AUDIO_CACHE_DAYS` | `14` | 提取音频缓存保留天数（最小 7 天）；缓存位于 `/app/temp/asr-audio` |
| `ASR_POLL_MS` | `1500` | 主应用轮询 ASR 任务进度的间隔（毫秒），高级参数 |
| `ASR_DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | 说话人分离模型；仅 enhanced sidecar |
| `HF_TOKEN` | 空 | Hugging Face Token；仅 enhanced 的说话人分离/受许可模型需要 |

### 4.3 OCR 变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OCR_MEDIA_ROOT` | `/media` | OCR 可访问的媒体根目录；必须与主应用挂载路径一致 |
| `OCR_LANGUAGE` | `en` | 默认 OCR 语言，例如 `en` / `zh-CN` / `ja` |
| `OCR_ENGINE` | `auto` | `auto` / `rapidocr` / `tesseract` |
| `OCR_FPS` | `2` | 抽帧 OCR 帧率；低配 NAS 可降到 `1` |
| `OCR_WORKERS` | `4` | 并行 OCR 线程数；低配可降到 `2` |
| `OCR_MIN_CONFIDENCE` | `25` | 低置信度过滤阈值（0–100） |
| `OCR_MAX_SECONDS` | `7200` | 单个视频最大 OCR 时长；超过直接报错 |

### 4.4 数据库 / 多 Worker

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 空 | PostgreSQL 连接串；设置后优先于 `DB_PATH` |
| `PG_POOL_SIZE` | `5` | PostgreSQL 连接池大小；同步桥为低并发设计 |
| `POSTGRES_USER` | `subx` | PostgreSQL 用户名；需与 `DATABASE_URL` 一致 |
| `POSTGRES_PASSWORD` | `subx` | PostgreSQL 密码；生产环境请修改 |
| `POSTGRES_DB` | `subx` | PostgreSQL 数据库名；需与 `DATABASE_URL` 一致 |
| `SUBX_WORKER_ID` | 进程 PID | 单主机多 Worker / 多实例标识 |
| `SUBX_WORKER_STALE_SECONDS` | `120` | 回收陈旧任务的超时时间（秒） |

### 4.5 内部 / 测试变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 运行时环境；镜像已设置，不建议修改 |
| `PG_TEST_DATABASE_URL` | 空 | 仅 PostgreSQL 测试使用，不用于生产 |

> 拆分部署时，`ASR_*` / `OCR_*` 变量同样适用；模型目录和媒体挂载必须与 sidecar 容器一致。完整 Compose 示例和逐项注释以根目录 `docker-compose.yml` 为准。

## 5. 下载镜像：进度、暂停与代理

Docker 本身会显示每个 layer 的下载进度。拉取被中断后，已下载的 layer 会保留，重新执行同一命令即可续传。

辅助脚本：

```bash
# 默认拉取 v2.6.2
./scripts/pull-image.sh

# 指定版本
./scripts/pull-image.sh --tag v2.6.2

# 使用 compose 文件中的 subx 服务
./scripts/pull-image.sh --compose

# 为本次命令设置代理
./scripts/pull-image.sh --proxy http://192.168.1.2:7890
```

暂停与续传：

```text
执行脚本或 docker pull → 按 Ctrl+C → 重新执行同一命令
```

> [!IMPORTANT]
> `docker pull` 由 Docker Daemon 执行，`HTTP_PROXY` 环境变量只对命令行客户端生效。Linux 需要单独配置 Daemon 代理：

```ini
# /etc/systemd/system/docker.service.d/http-proxy.conf
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:7890"
Environment="HTTPS_PROXY=http://127.0.0.1:7890"
Environment="NO_PROXY=localhost,127.0.0.1"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

Docker Desktop 在 `Settings → Resources → Proxies` 中配置即可。

## 6. 下载模型：进度、暂停、续传与代理

进入「设置 → 语音识别 → 本地模型管理」：

1. 选择当前引擎（自动 / faster-whisper / whisper.cpp）。
2. 点击模型右侧「下载」。
3. 查看进度条、已下载/总大小、速度、剩余时间和当前文件。
4. 可随时「暂停」「继续」「取消」。
5. 失败后可点击「继续」重试；重新开始会从 `.part` 断点续传。
6. 已安装模型可「卸载」释放空间。

模型保存位置：

```text
./data/models/faster-whisper/<model>   # faster-whisper
./data/models/whisper-cpp/ggml-*.bin   # whisper.cpp
```

代理：

- 设置页「本地模型管理」顶部填写，保存在浏览器 `localStorage`，不写入数据库。
- 或设置 `ASR_DOWNLOAD_PROXY`，作为服务端默认值。
- 未显式配置时，会自动读取容器的 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`。
- 仅支持 `http://` 和 `https://`；不支持 SOCKS。

Hugging Face 镜像站：

```yaml
environment:
  ASR_HF_ENDPOINT: https://hf-mirror.com
```

其他说明：

- 默认 `ASR_AUTO_DOWNLOAD=false`，任务不会在后台静默下载模型；未下载时会给出明确错误。
- 如果希望恢复旧 sidecar 的自动下载行为，可设置 `ASR_AUTO_DOWNLOAD=true`。
- OCR 模型已内置，不需要手动下载。
- 下载任务元数据保存在 `/models/.subx-download-jobs.json`，容器重启后显示为「已暂停」，可继续下载。

## 7. 反向代理

使用 Nginx、Traefik、宝塔或 NAS 反向代理时，请确保：

- 页面路由正常转发。
- `/api/*` 正常转发。
- `/_nuxt/*` 静态资源正常转发。
- 透传 `X-Forwarded-Proto: https`。
- 如代理修改 Host，配置 `X-Forwarded-Host` 或将外部域名加入 `SUBX_ALLOWED_ORIGINS`。
- 不要缓存 `/` 和 `/login`。

典型 Nginx 片段：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

> 模型下载和长任务通过浏览器轮询/SSE 查看状态，反代需要允许较长的请求时间。

## 8. 拆分部署与特殊硬件

单镜像已经覆盖大多数 NAS。以下场景再使用 sidecar；ASR/OCR 变量见第 4.2 / 4.3 节。

### 8.1 独立 ASR 容器

```bash
docker compose --profile asr up -d asr
```

然后在设置页把 ASR 地址改为：

```text
http://subx-asr:8000
```

独立镜像：`ghcr.io/marod1m/subx-asr:v2.6.2`。模型目录为 `./data/models/asr`。

### 8.2 独立 OCR 容器

```bash
docker compose --profile ocr up -d ocr
```

设置页 OCR 地址改为 `http://subx-ocr:8000`。OCR 容器必须挂载与主应用相同的媒体目录，容器内路径也要一致。

### 8.3 NVIDIA GPU ASR

```bash
docker compose --profile asr-gpu up -d asr-gpu
```

设置页 ASR 地址改为 `http://subx-asr-gpu:8000`。需要 NVIDIA Container Toolkit 和可用驱动；P106-100、RX 580 等矿卡不保证兼容。

### 8.4 增强 ASR（Demucs / DeepFilterNet / pyannote）

```bash
docker compose --profile asr-enhanced up -d asr-enhanced
```

设置页地址改为 `http://subx-asr-enhanced:8000`。需要说话人分离时设置 `HF_TOKEN`，并接受 pyannote 模型许可。

## 9. 健康检查与指标

```text
GET /api/health
```

返回 `{"ok":true,"status":"ok"}` 表示数据库可用。

```text
GET /api/metrics
```

返回 Prometheus 文本格式的轻量指标，包括任务状态、队列状态、翻译缓存和日志数量。该接口受登录保护。

ASR 内部健康检查：

```text
容器内 http://127.0.0.1:8000/health
```

OCR 内部健康检查：

```text
容器内 http://127.0.0.1:8001/health
```

## 10. 自动化、通知与 API

### 目录监控

- 监控目录必须位于已配置的媒体库内，页面填写相对路径。
- 容器需要能持续读取媒体目录；NAS 休眠或挂载断开时事件会进入失败记录。
- 实时监听使用 chokidar，另有 60 秒轮询兜底。
- 自动任务默认并发 1，可在「自动化」页面调整。
- 已有字幕或目标输出默认跳过，避免重复翻译和输出循环。

### 通知出站

- Telegram、Webhook、ntfy 需要容器能访问对应网络；国内网络可配置代理。
- SMTP 需要允许容器访问邮件服务器端口。
- 通知失败会重试，不阻塞字幕任务。
- 通知密钥与 API Key 一样加密存储，更换 `SUBX_SECRET_KEY` 后需要重新填写。

#### Telegram / 通知代理排障

一句话：**渠道里的代理优先；没填就自动用容器的 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`。**

- 容器里的 `127.0.0.1` 指向容器自己，不指向 NAS 宿主机。代理在宿主机上时，请填宿主机局域网 IP，例如 `http://192.168.1.10:7890`。
- 在 Telegram 通知编辑框里点「测试代理」，会显示代理连通性、HTTP 状态和延迟。
- 报错现在会带底层原因，例如 `ECONNREFUSED`、`ENOTFOUND`、`ETIMEDOUT`，不再只有一句 `fetch failed`。
- 如果代理只支持 SOCKS5，当前版本不支持；请换成 HTTP/HTTPS 代理，或等待后续 SOCKS 支持。

### API Token

- 建议为下载器、脚本分别创建独立 Token，只授予必要 scope。
- Token 明文只在创建时显示一次。
- 撤销 Token 后调用立即失败；调用记录可在「自动化 → API Token」查看。
- OpenAPI：`GET /api/openapi.json`。

## 11. 任务队列与重启恢复

任务会持久化到 SQLite 的 `task_jobs` 表。容器重启后：

- 运行中的任务会重新进入队列。
- 队列会记录尝试次数和心跳。
- 超过最大尝试次数的任务会标记为失败。
- 可在任务详情页查看日志并手动重试。

普通 NAS 单实例部署不需要 Redis。

## 12. 升级与备份

升级到 v2.6.2：

```bash
docker compose pull
docker compose up -d --force-recreate
```

升级说明：

- v2.6.2 为 ASR 可靠性与首页交互修复补丁；从 v2.6.1 升级不需要调整卷或环境变量，重新拉取镜像即可。
- 主应用镜像已包含 ASR/OCR，旧的 `--profile asr` / `--profile ocr` 不再需要。
- 单镜像会把旧默认地址 `http://subx-asr:8000` / `http://subx-ocr:8000` **一次性**迁移到 `127.0.0.1`；迁移后以设置页保存的地址为准，不会覆盖你后来填写的 sidecar 地址。
- 如需继续连接外部 sidecar，设置 `SUBX_KEEP_LEGACY_SIDECAR_URLS=true`，并保留旧的 sidecar 容器。
- 新增 `./data/models:/models` 卷；首次需要在设置页手动下载模型，或复用旧模型缓存。
- 旧 Session 会失效，需要重新登录。

备份：

- 备份 `DB_PATH` 所在目录，例如 `./data/db`。
- 备份模型缓存 `./data/models`，避免重新下载。
- 如需保留排查日志，同时备份 `./data/temp`。
- 数据库使用 SQLite WAL，建议在容器停止后备份，或同时备份 `-wal`/`-shm` 文件。

## 13. PostgreSQL 运行时

先启动可选 PostgreSQL：

```bash
docker compose --profile postgres up -d postgres
```

设置 `DATABASE_URL` 后，SubX 会优先使用 PostgreSQL：

```yaml
environment:
  DATABASE_URL: postgres://subx:password@postgres:5432/subx
  PG_POOL_SIZE: 5
```

- 自动创建 schema。
- 未设置 `DATABASE_URL` 时继续使用 `DB_PATH` 的 SQLite。
- 多主机 Worker 建议使用 PostgreSQL。
- 从 SQLite 迁移：

```bash
DATABASE_URL=postgres://... node scripts/export-sqlite-to-postgres.mjs --sqlite ./data/db/subx.db
```

详见 [PostgreSQL 迁移评估](postgresql-evaluation.md)。

## 14. 多 Worker / 多实例

单主机多 Worker 可以共享同一个本地 SQLite 数据目录：

```yaml
environment:
  SUBX_WORKER_ID: worker-1
  SUBX_WORKER_STALE_SECONDS: 120
```

- `SUBX_WORKER_ID` 用于区分实例；默认使用进程 PID。
- 心跳每 10 秒更新一次。
- 启动时只回收超过 `SUBX_WORKER_STALE_SECONDS` 的陈旧任务，不会抢占其他活跃 Worker。
- 不要把 SQLite 数据库放在 NFS/SMB 等网络文件系统上。
- 多主机部署建议使用 PostgreSQL；当前已提供 schema 和 SQLite → PostgreSQL 数据迁移脚本，但运行时仍默认 SQLite。详见 [PostgreSQL 迁移评估](postgresql-evaluation.md)。

## 15. 常见问题

### 页面能打开但看不到文件

- 检查 Docker 挂载路径。
- 检查 `VIDEO_DIR` 或媒体库路径是否为容器内路径。
- 检查容器用户是否有读取权限。

### 设置里填宿主机路径不生效

应用运行在容器内，只能读取容器内路径。请填写挂载后的路径，例如 `/media/tv`。

### 提示权限不足 / SQLITE_CANTOPEN

- 数据目录必须对容器用户可写。镜像启动时会按 `PUID/PGID` 修复 `DB_PATH` 所在目录、`/app/temp` 和 `/models` 权限。
- 默认用户是 `1001:1001`。如果宿主机媒体属于其他用户，请设置 `PUID`/`PGID` 为实际所有者。
- 媒体目录默认不做递归 chown，避免大目录启动缓慢；需要时可设置 `CHOWN_MEDIA=true`。
- 模型目录权限异常时可设置 `CHOWN_MODELS=true`。
- 也可在宿主机手动修复：

```bash
sudo chown -R 1001:1001 ./data/db ./data/temp ./data/models
```

- 如果使用 `user:` 覆盖容器用户，入口脚本不会执行 chown，需要自行保证目录权限。

### ASR 服务不可用

先看任务日志里的 ASR 地址：现在连接失败会明确写出“已尝试 http://...”，不再只有一句 fetch failed。

单镜像排查顺序：

1. 设置页「语音识别」地址应是 `http://127.0.0.1:8000`，点「使用内置」可以一键恢复。
2. 看容器日志：

```bash
docker compose logs -f subx | grep -Ei 'ASR|uvicorn|error|traceback'
```

正常应能看到 `starting built-in ASR` 和 `ASR ready`。如果 ASR 进程一启动就退出，日志里会有 Python traceback，常见原因是 CPU 指令集不兼容或依赖缺失。

3. 在容器里直接测健康检查：

```bash
docker exec -it subx curl -fsS http://127.0.0.1:8000/health
```

4. 如果配置了 `ASR_INTERNAL_URL` 或旧的 `http://subx-asr:8000`，确认地址真的可达；单镜像会自动尝试内置 `127.0.0.1:8000` 作为兜底，但外部地址错误时仍会先失败一次。
5. 如果提示“模型未下载”，去设置页「本地模型管理」下载；如果提示 ECONNREFUSED，则是 ASR 进程/端口问题，不是模型问题。

拆分部署时，确认 sidecar 已启动且服务名正确。

### 模型下载失败

- 检查容器是否能访问 Hugging Face；国内网络可设置 `ASR_HF_ENDPOINT=https://hf-mirror.com`。
- 在「本地模型管理」填写 HTTP(S) 代理，或设置 `ASR_DOWNLOAD_PROXY`。
- 确认 `./data/models` 可写、磁盘空间足够。
- 代理只支持 `http://` / `https://`，不支持 SOCKS。
- 下载失败后点击「继续」，会从断点续传。

### 镜像太大 / 拉取很慢

- v2.6.2 单镜像包含 Python、FFmpeg、Tesseract 语言包和 OCR 依赖：amd64 下载约 586 MiB、解压后约 1.57 GiB；arm64 下载约 520 MiB（不含模型）。
- 使用 `./scripts/pull-image.sh` 查看 Docker 原生进度；Ctrl+C 暂停后重新执行可续传。
- 配置 Docker Daemon 代理（见第 5 节）。
- 只需要主应用时，可继续使用旧版精简镜像和独立 sidecar，但不再推荐。

### 忘记口令怎么办

SubX 没有云端账号，也没有“找回密码”后门。确认无法找回时，按下面步骤重置：

1. 停止容器，先备份 `./data/db`。
2. 用 SQLite 工具打开数据库，执行：

```sql
DELETE FROM auth;
DELETE FROM sessions;
```

3. 重启容器，刷新登录页，重新设置口令。

这样只清掉登录口令和会话，不会删除媒体、字幕、模型、任务历史和翻译记录。使用 PostgreSQL 时，对 PostgreSQL 数据库执行同样的 SQL 即可。

> 登录页的「获取帮助」弹窗也写了这套步骤，忘了口令时不用翻半天文档。

### 任务失败

优先检查：

- API Key、模型名、Base URL。
- 模型服务是否能从容器内访问。
- 媒体库路径是否可读。
- 任务详情中的错误日志和原始响应。
- 容器日志：`docker compose logs -f subx`。
