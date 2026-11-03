# SubX OCR Service

图像字幕 OCR 服务，用于 PGS / VobSub / DVD。v2.5.0 起默认运行在 SubX 单镜像内部（`127.0.0.1:8001`），也可以独立 sidecar 部署。

- PGS：FFmpeg 提取 `.sup` 后交给 pgsrip；结果为空、文本过少或时间覆盖异常时自动回退到位图 overlay 抽帧。
- FFmpeg/pgsrip 失败时会保留 stderr 摘要，并通过任务错误返回，避免只看到 `exit status 1`。
- VobSub / DVD：FFmpeg 将位图字幕 overlay 到黑色背景（不使用仅支持文本字幕的 `subtitles` 滤镜），按 `OCR_FPS` 抽帧，再按字幕区域亮像素检测空白、按图像哈希去重并并行 OCR。
- 图像会先裁剪字幕区域、放大、灰度化、Otsu 二值化并反色为黑字白底，再交给 Tesseract；中英文优先尝试 RapidOCR。
- 空白检测使用字幕区域有效亮像素比例，不再使用整帧平均亮度，避免普通字幕被误判为空白。
- 异步任务接口：`POST /v1/subtitles/ocr/jobs`、`GET /v1/subtitles/ocr/jobs/{id}`、`POST /v1/subtitles/ocr/jobs/{id}/cancel`。
- 默认 `OCR_FPS=2`、`OCR_WORKERS=4`；低配 NAS 可降到 `1` / `2`。
- PGS 使用 pgsrip AutoEngine（Tesseract + RapidOCR）；抽帧 OCR 在中文/英文下优先 RapidOCR，失败回退 Tesseract。
- `OCR_ENGINE` 可设 `auto` / `rapidocr` / `tesseract`；请求体可用 `engine` / `min_confidence` 覆盖。
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
| `OCR_MIN_CONFIDENCE` | `25` | 低置信度过滤阈值（0–100） |
| `OCR_MAX_SECONDS` | `7200` | 单个视频最大 OCR 时长；超过直接报错 |
| `OCR_TEMP_DIR` | `/app/temp/ocr` | 抽帧临时目录；默认与主应用 `./data/temp/ocr` 一致 |
| `OCR_API_KEY` | 空 | 可选服务鉴权；主镜像设置后会自动作为默认 Key 使用 |

健康检查：

```bash
curl http://127.0.0.1:8000/health
```
