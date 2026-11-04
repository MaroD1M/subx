# SubX OCR Service

图像字幕 OCR 服务，用于 PGS / VobSub / DVD。v2.5.0 起默认运行在 SubX 单镜像内部（`127.0.0.1:8001`），也可以独立 sidecar 部署。

- PGS：FFmpeg 提取 `.sup` 后交给 pgsrip；提取文件名会携带轨道语言，强制轨额外带 `.forced` 标记；pgsrip 再显式选择 forced/full 轨，避免按语言或 flags 误过滤。长电影不强制整片抽帧，结果为空、文本过少或时间覆盖异常时自动回退到分段位图 OCR。
- FFmpeg/pgsrip 失败时会保留 stderr 摘要，并通过任务错误返回，避免只看到 `exit status 1`。
- VobSub / DVD：FFmpeg 将位图字幕 overlay 到黑色背景（不使用仅支持文本字幕的 `subtitles` 滤镜），按 `OCR_FPS` 抽帧，再按字幕区域亮像素检测空白、按图像哈希去重并并行 OCR。
- 图像会先裁剪字幕区域、放大、灰度化、Otsu 二值化并反色为黑字白底，再交给 Tesseract；中英文优先尝试 RapidOCR。
- 空白检测使用字幕区域有效亮像素比例，不再使用整帧平均亮度，避免普通字幕被误判为空白。
- VobSub / DVD 长视频按 `OCR_CHUNK_SECONDS` 分段处理，每段完成立即清理帧文件。
- 分段断点保存在 `OCR_TEMP_DIR/subx-ocr-job-*`，失败重试可复用已完成分段，按 `OCR_RESUME_TTL_HOURS` 清理。
- 异步任务接口：`POST /v1/subtitles/ocr/jobs`、`GET /v1/subtitles/ocr/jobs/{id}`、`POST /v1/subtitles/ocr/jobs/{id}/cancel`。
- 默认 `OCR_FPS=2`、`OCR_WORKERS=4`；低配 NAS 可降到 `1` / `2`。
- PGS 使用 pgsrip AutoEngine（Tesseract + RapidOCR）；抽帧 OCR 在中文/英文下优先 RapidOCR，失败回退 Tesseract。
- `OCR_ENGINE` 可设 `auto` / `rapidocr` / `tesseract`；请求体可用 `engine` / `min_confidence` 覆盖。
- 请求体还可用 `max_seconds`、`chunk_seconds`、`pgsrip_timeout_seconds`、`ffmpeg_timeout_seconds`、`chunk_retries`、`resume_ttl_hours` 覆盖服务默认值；主应用设置页会随任务下发。
- 媒体目录必须与主应用使用相同容器内路径，通过 `OCR_MEDIA_ROOT` 指定。
- 默认语言 `en`；支持中/英/日/韩/俄/法/德/西/意/葡/泰/阿/印地/土耳其/越南/乌克兰/荷兰/波兰/瑞典/丹麦/芬兰/挪威/捷克/希腊/希伯来/印尼/马来语。
- 低置信度结果不再静默丢弃；会保留文本和置信度，由主应用进入核对页高亮。`OCR_MIN_CONFIDENCE` 用作低置信度提示阈值。

单镜像已经内置本服务和 Tesseract 语言包、RapidOCR，不需要手动下载 OCR 模型，也不需要启动 `--profile ocr`。

拆分部署：

```bash
docker compose --profile ocr up -d ocr
```

然后在 SubX 设置页把 OCR 地址改为 `http://subx-ocr:8000`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OCR_MEDIA_ROOT` | `/media` | OCR 可访问的媒体根目录；必须与主应用挂载路径一致 |
| `OCR_LANGUAGE` | `en` | 默认 OCR 语言，例如 `en` / `zh-CN` / `ja` |
| `OCR_ENGINE` | `auto` | `auto` / `rapidocr` / `tesseract` |
| `OCR_FPS` | `2` | 抽帧 OCR 帧率；低配可降到 `1` |
| `OCR_WORKERS` | `4` | 并行 OCR 线程数；低配可降到 `2` |
| `OCR_MIN_CONFIDENCE` | `25` | 低置信度提示阈值（0–100），结果保留并进入核对 |
| `OCR_MAX_SECONDS` | `14400` | OCR 最大视频时长；默认 4 小时 |
| `OCR_CHUNK_SECONDS` | `1800` | VobSub/DVD 分段时长；默认 30 分钟 |
| `OCR_PGSRIP_TIMEOUT_SECONDS` | `7200` | pgsrip 单次识别超时 |
| `OCR_FFMPEG_TIMEOUT_SECONDS` | `3600` | 单段抽帧/字幕提取超时 |
| `OCR_CHUNK_RETRIES` | `1` | 单段失败重试次数 |
| `OCR_RESUME_TTL_HOURS` | `24` | 分段断点保留时间 |
| `OCR_MAX_CONCURRENT_JOBS` | `2` | 同时运行的 OCR 任务上限 |
| `OCR_TEMP_DIR` | `/app/temp/ocr` | 抽帧与断点临时目录；默认与主应用 `./data/temp/ocr` 一致 |
| `OCR_API_KEY` | 空 | 可选服务鉴权；主镜像设置后会自动作为默认 Key 使用 |

> 主应用会在请求中传入设置页的“长视频与超时”参数；环境变量主要用于服务默认值和未传参数时的兜底。

健康检查：

```bash
curl http://127.0.0.1:8000/health
```
