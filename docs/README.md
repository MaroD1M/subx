# SubX 文档

> 适用版本：v2.10.1

SubX 是面向 NAS 与自托管环境的 AI 字幕工作台：扫描媒体库、读取内嵌或外挂字幕、语音识别、图像字幕 OCR、调用 LLM 翻译，并输出 SRT/ASS。

## 按角色选择

| 你是 | 建议阅读 |
| --- | --- |
| 第一次部署 | [部署文档](deployment.md) → [快速开始](getting-started.md) |
| 日常使用 | [快速开始](getting-started.md) → [翻译设置](guide/translation.md) → [核对与导出](guide/review-export.md) |
| 处理无字幕视频 | [媒体库与语音识别](guide/media-asr.md) |
| 处理 PGS / VobSub / DVD | [图像字幕 OCR](guide/ocr.md) |
| 配置自动化和通知 | [自动化与集成](guide/automation.md) |
| 运维和备份 | [运维与数据管理](operations.md) → [升级与回滚](reference/upgrade.md) |
| 遇到报错 | [故障排查](troubleshooting.md) |
| 参与开发 | [维护与架构说明](development/maintenance.md) → [实测指南](development/testing-guide.md) |

## 按场景选择

| 我想…… | 文档 |
| --- | --- |
| 用 Docker Compose 跑起来 | [部署文档](deployment.md) |
| 接 Ollama 或局域网模型 | [翻译设置](guide/translation.md) |
| 让翻译保留人物语气和术语 | [翻译设置](guide/translation.md) |
| 管理全局/系列术语、导入导出和版本回滚 | [术语库管理](guide/translation.md#术语库管理) |
| 给没有字幕的剧集听写 | [媒体库与语音识别](guide/media-asr.md) |
| 处理图片字幕 | [图像字幕 OCR](guide/ocr.md) |
| 新片自动翻译 | [自动化与集成](guide/automation.md) |
| 接 Sonarr / Radarr / Jellyfin | [自动化与集成](guide/automation.md) |
| 校对、改时间轴、导出 ASS | [核对与导出](guide/review-export.md) |
| 查环境变量默认值 | [环境变量参考](reference/environment.md) |
| 清理缓存或备份数据 | [运维与数据管理](operations.md) |
| 从旧版本升级 | [升级与回滚](reference/upgrade.md) |
| 忘记访问口令 | [故障排查](troubleshooting.md) |

## 文档地图

```
README.md                    项目门面与快速开始
docs/
  README.md                  本页，文档索引
  usage.md                   使用文档入口
  getting-started.md         首次配置、媒体库和第一个任务
  guide/
    translation.md           AI 连接、翻译行为、质量、风格和术语
    media-asr.md             文件浏览、轨道策略、覆盖检查和语音识别
    ocr.md                   图像字幕 OCR
    automation.md            监控目录、通知、API Token 和外部集成
    review-export.md         字幕核对、时间编辑和导出格式
  deployment.md              Compose、NAS、反向代理和拆分部署
  reference/
    environment.md           环境变量完整参考
    upgrade.md               通用升级与回滚步骤
  operations.md              存储缓存、备份恢复、健康检查和多 Worker
  troubleshooting.md         日志、常见报错和 FAQ
  development/
    maintenance.md           目录职责、缓存、migration 和发版流程
    testing-guide.md         真实设备与功能回归清单
    asr-benchmark.md         ASR 多语言基准
    postgresql.md            PostgreSQL 运行时与迁移
```

## 文档约定

- 版本号以 `package.json` 为准，由 `npm run check:versions` 校验。
- 本地链接、锚点、图片和环境变量引用由 `npm run docs:check` 校验。
- 版本变更和升级注意事项只写在 [CHANGELOG](../CHANGELOG.md)。
- 文档保持中文；命令、变量名和界面专有名词保留原文。
