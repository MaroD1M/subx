# 运维与数据管理

> 适用版本：v2.10.1
>
> 本页覆盖存储与缓存、备份恢复、健康检查、任务队列和多 Worker。

## 存储与缓存

「设置 → 存储与缓存」用于查看磁盘和 SubX 自己生成的缓存占用，不会扫描或删除媒体文件。

| 类型 | 内容 | 清理建议 |
| --- | --- | --- |
| ASR 音频缓存 | 语音识别提取的 WAV，失败重试会复用 | 默认保留 14 天，可用 `ASR_AUDIO_CACHE_DAYS` 调整 |
| OCR 临时图像 | `temp/ocr` 抽帧目录与 `subx-ocr-job-*` 断点；兼容清理旧 `/tmp` 残留 | 长时间任务后检查 |
| 实景预览缓存 | `temp/preview` 下实景字幕预览生成的 PNG 和临时 ASS | 可清理，24 小时后也会自动回收 |
| 任务临时文件 | 字幕临时文件、音频片段、分块 partial | 按天清理 |
| AI 请求日志 | 翻译请求/响应调试日志 | 排障后可清理 |
| 任务日志文件 | `db/logs/task_*.log` | 按天清理 |
| 翻译缓存 | 数据库中的可复用翻译结果 | 可全部清理，后续会重新生成 |
| 本地模型 | Whisper 等模型文件 | 不参与缓存清理；在「语音识别 → 本地模型管理」卸载 |

- “清理旧缓存”按各类型的默认保留天数清理。
- “自动备份”可设置间隔小时数和保留份数，支持立即备份；应用内自动备份仅支持 SQLite，PostgreSQL 请使用 pg_dump。
- “全部清理”会跳过最近 5 分钟仍在使用的文件，并额外保护正在使用的 ASR 音频、任务临时文件和活跃 OCR 临时目录。
- 清理不会删除媒体、导出的字幕或模型。
- AI 请求日志默认只记录任务、模型、耗时、token、prompt/response 长度和解析结果摘要，不保存完整 prompt 与响应正文；排障确需完整正文时，显式设置 `SUBX_AI_LOG_FULL_PAYLOAD=1`，用完请关闭。

---

## 备份与恢复

推荐在宿主机执行 `npm run backup`，默认写入 `backups/subx-*`，包含数据库、`.secret` 和任务日志。

- 备份目录默认权限为 `0700`，数据库和 `.secret` 为 `0600`；`backups/` 已加入 `.gitignore`，不要上传或提交。
- 只保留最近 10 份备份：`npm run backup -- --keep 10`。
- 不想把加密密钥放进备份时使用 `npm run backup -- --no-secret`；但这样的备份无法恢复已加密的 AI Key 和通知密钥。
- 恢复前停止容器，再执行 `npm run restore -- ./backups/subx-*`；脚本会校验完整性、检查 schema 版本并保留旧数据库。
- 如果备份 schema 高于当前程序，恢复会被拒绝；如果要从新库降级到旧备份，需要确认后追加 `--force`。
- 也可以手动备份 `DB_PATH` 所在目录，例如 `./data/db`；建议停止容器后备份，或同时备份 `-wal`/`-shm` 文件。
- 备份模型缓存 `./data/models`，避免重新下载。
- 如需保留排查日志，同时备份 `./data/temp`。
- 也可以在「设置 → 存储与缓存 → 自动备份」中启用应用内定时备份（仅 SQLite），设置间隔和保留份数。应用内备份写入容器 `/app/backups`，Compose 默认映射到 `./data/backups`，请确保该目录已挂载。
- 需要定时备份时，可在宿主机 crontab 中执行（路径按实际项目目录修改）：

```bash
0 3 * * * cd /path/to/subx && /usr/bin/npm run backup -- --keep 10 >> ./data/backup.log 2>&1
```

---

## 健康检查与指标

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

---

## 任务队列与重启恢复

任务会持久化到 SQLite 的 `task_jobs` 表。容器重启后：

- 运行中的任务会重新进入队列。
- 队列会记录尝试次数和心跳。
- 超过最大尝试次数的任务会标记为失败。
- 可在任务详情页查看日志并手动重试。

普通 NAS 单实例部署不需要 Redis。

---

## 多 Worker / 多实例

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
- 多主机部署建议使用 PostgreSQL；当前已提供 schema 和 SQLite → PostgreSQL 数据迁移脚本，但运行时仍默认 SQLite。详见 [PostgreSQL 运行时与迁移](development/postgresql.md)。

---

## 相关文档

- [环境变量参考](reference/environment.md)
- [升级与回滚](reference/upgrade.md)
- [部署文档](deployment.md)
- [故障排查](troubleshooting.md)
