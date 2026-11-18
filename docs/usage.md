# SubX 使用文档

> 适用版本：v2.11.3
>
> 本页是使用文档入口。旧版 `usage.md` 的章节已拆分到下面的页面，收藏的旧链接可以从这里继续进入。

## 第一次使用

| 文档 | 内容 |
| --- | --- |
| [快速开始](getting-started.md) | 首次访问、AI 接口、媒体库、第一个翻译任务、任务管理 |
| [部署文档](deployment.md) | Docker Compose、NAS 路径和反向代理 |

## 功能文档

| 文档 | 内容 |
| --- | --- |
| [翻译设置](guide/translation.md) | AI 连接、翻译行为、性能参数、智能增强、质量校验、风格和术语表 |
| [媒体库与语音识别](guide/media-asr.md) | 文件浏览、字幕轨道、覆盖检查、批量任务和 ASR |
| [图像字幕 OCR](guide/ocr.md) | PGS / VobSub / DVD 图像字幕处理 |
| [自动化与集成](guide/automation.md) | 监控目录、过滤规则、通知、API Token、Sonarr/Radarr/Jellyfin 等 |
| [核对与导出](guide/review-export.md) | 字幕核对、批量重译、时间编辑、实时预览和导出格式 |

## 参考与运维

| 文档 | 内容 |
| --- | --- |
| [环境变量参考](reference/environment.md) | 主镜像、ASR、OCR、数据库和多 Worker 变量 |
| [运维与数据管理](operations.md) | 存储与缓存、备份恢复、健康检查和多 Worker |
| [升级与回滚](reference/upgrade.md) | 通用升级步骤和回滚注意事项 |
| [故障排查](troubleshooting.md) | 任务日志、常见报错和 FAQ |

## 开发文档

| 文档 | 内容 |
| --- | --- |
| [维护与架构说明](development/maintenance.md) | 目录职责、共享缓存、数据库迁移和发版流程 |
| [实测指南](development/testing-guide.md) | 真实 NAS 和单镜像回归清单 |
| [ASR 基准](development/asr-benchmark.md) | 11 语言基准脚本与结果模板 |
| [PostgreSQL 运行时](development/postgresql.md) | 可选 PostgreSQL 运行时与迁移 |

完整文档索引见 [docs/README.md](README.md)。
