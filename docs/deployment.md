# SubX 部署文档

> 适用版本：v2.10.0

本文档覆盖单镜像部署、NAS、镜像与模型下载、反向代理和拆分部署。升级、备份、健康检查和常见问题见[相关文档](#8-相关文档)。使用说明请参阅 [使用文档](usage.md)。仓库根目录的 [`docker-compose.yml`](../docker-compose.yml) 是带完整注释的模板。

## 1. 架构

从 v2.5.0 开始，主应用镜像 `ghcr.io/marod1m/subx` 同时包含：

- Nuxt / Nitro Web 应用（端口 `3000`）
- 本地 ASR 服务（容器内 `127.0.0.1:8000`，faster-whisper / whisper.cpp）
- 本地 OCR 服务（容器内 `127.0.0.1:8001`，Tesseract / RapidOCR）

内部 ASR/OCR 只监听回环地址，不对外暴露端口。默认只需要一个 `subx` 容器。

Whisper 模型体积较大且与硬件相关，**不打进镜像**。首次进入「设置 → 语音识别 → 本地模型管理」手动开始下载，支持进度、速度、剩余时间、暂停、续传、取消、重试、卸载、代理和 Hugging Face 镜像站。

OCR 使用镜像内置的 Tesseract 语言包和 RapidOCR，不需要额外下载模型。

拆分部署的 `subx-asr`、`subx-ocr`、增强版和 GPU 版 sidecar 仍然保留，见第 7 节。

## 2. Docker Compose 快速部署

```yaml
services:
  subx:
    image: ghcr.io/marod1m/subx:v2.10.0
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
      - ./data/backups:/app/backups
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
4. 需要无字幕识别时开启「启用语音识别」；需要图像字幕时进入「设置 → 图像字幕 OCR」开启 OCR，并按需选择语言和引擎。
5. 回首页开始翻译。

> 镜像体积会随版本、架构和内置字体变化，建议至少预留 2–3 GB 磁盘。模型体积参考：`tiny` 约 75MB、`small` 约 500MB、`medium` 约 1.5GB、`large-v3` 约 3GB。建议为 `./data/models` 预留 10–20GB。
>
> 实景字幕预览需要中文字体，镜像已内置 `fonts-noto-cjk`、`fonts-wqy-microhei` 和 `fonts-dejavu-core`，镜像体积会比旧版更大。如需使用自己的字体，把字体文件放到宿主机目录并挂载到容器 `/fonts`，然后重启容器即可。

> [!TIP]
> 不想读全文？先只改三处：媒体路径、`PUID/PGID`、`SUBX_SECRET_KEY`。然后 `docker compose up -d`，进设置页下载模型。其他默认值先别动，真的够用。

### 2.1 Compose 结构与参数说明

根目录 [`docker-compose.yml`](../docker-compose.yml) 已逐项注释，默认只启动 `subx` 服务：

| 配置段 | 作用 | 注意 |
| --- | --- | --- |
| `ports` | 暴露 Web 端口 `3000` | 内置 ASR/OCR 只监听 `127.0.0.1:8000/8001`，不要额外映射端口 |
| `volumes` | 媒体、数据库、临时文件、模型缓存 | `./data/models` 建议预留 10–20GB；媒体只读时无法输出字幕 |
| `environment` | 基础、内置服务、ASR、OCR、数据库、Worker、反代 | 完整变量见[环境变量参考](reference/environment.md) |
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
    image: ghcr.io/marod1m/subx:v2.10.0
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

## 4. 下载镜像：进度、暂停与代理

Docker 本身会显示每个 layer 的下载进度。拉取被中断后，已下载的 layer 会保留，重新执行同一命令即可续传。

辅助脚本：

```bash
# 默认拉取 v2.10.0
./scripts/pull-image.sh

# 指定版本
./scripts/pull-image.sh --tag v2.10.0

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

## 5. 下载模型：进度、暂停、续传与代理

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
- 模型下载与启动时后台校验支持 Hugging Face LFS sha256；仅旧 manifest 缺元数据且当前离线时会跳过校验并记录退避时间。
- 自动目录改名前的暂停下载任务会在 ASR 服务启动时迁移到新目录，已下载部分和 `.part` 会保留；迁移失败则保留旧路径并告警。

## 6. 反向代理

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

## 7. 拆分部署与特殊硬件

单镜像已经覆盖大多数 NAS。以下场景再使用 sidecar；ASR/OCR 变量见[环境变量参考](reference/environment.md)。

### 7.1 独立 ASR 容器

```bash
docker compose --profile asr up -d asr
```

然后在设置页把 ASR 地址改为：

```text
http://subx-asr:8000
```

独立镜像：`ghcr.io/marod1m/subx-asr:v2.10.0`。模型目录为 `./data/models/asr`。

### 7.2 独立 OCR 容器

```bash
docker compose --profile ocr up -d ocr
```

设置页 OCR 地址改为 `http://subx-ocr:8000`。OCR 容器必须挂载与主应用相同的媒体目录，容器内路径也要一致。长视频分段、重试和超时参数由主应用随任务下发，设置页调整后不需要重启 OCR 容器；拆分部署时请同步升级 OCR 镜像到与主应用相同版本。

### 7.3 NVIDIA GPU ASR

```bash
docker compose --profile asr-gpu up -d asr-gpu
```

设置页 ASR 地址改为 `http://subx-asr-gpu:8000`。需要 NVIDIA Container Toolkit 和可用驱动；P106-100、RX 580 等矿卡不保证兼容。

### 7.4 增强 ASR（Demucs / DeepFilterNet / pyannote）

```bash
docker compose --profile asr-enhanced up -d asr-enhanced
```

设置页地址改为 `http://subx-asr-enhanced:8000`。需要说话人分离时设置 `HF_TOKEN`，并接受 pyannote 模型许可。

---

## 8. 相关文档

- 环境变量完整参考：[环境变量参考](reference/environment.md)
- 备份恢复、健康检查、多 Worker：[运维与数据管理](operations.md)
- 升级与回滚：[升级与回滚](reference/upgrade.md)
- 自动化、通知与 API：[自动化与集成](guide/automation.md)
- PostgreSQL 运行时：[PostgreSQL 运行时](development/postgresql.md)
- 常见问题：[故障排查](troubleshooting.md)
