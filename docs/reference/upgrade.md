# 升级与回滚

> 适用版本：v2.11.0
>
> 版本变更、数据库迁移和升级注意事项统一记录在 [CHANGELOG](../../CHANGELOG.md)，本页只保留通用操作步骤。

## 升级前

1. 阅读 [CHANGELOG](../../CHANGELOG.md) 中目标版本的 `Upgrade Notes`。
2. 备份数据库和密钥，见 [备份与恢复](../operations.md#备份与恢复)。
3. 确认媒体库、模型和数据库目录都已挂载到宿主机。

## 标准升级步骤

```bash
docker compose pull
docker compose up -d --force-recreate
```

升级后检查：

```bash
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
docker compose logs -f subx
```

访问「设置 → 系统体检」，确认数据库、媒体库、FFmpeg、字体、临时目录和磁盘状态正常。

## 从旧拆分部署迁移

v2.11.0 起只发布内置 ASR/OCR 的单镜像。旧 Compose 中如果还有 `asr`、`ocr` 或 `asr-enhanced` 服务：

1. 删除这些服务和对应镜像，只保留 `subx` 与可选 `postgres`。
2. 把 `subx` 镜像改为 `ghcr.io/marod1m/subx:v2.11.0`。
3. 保留原来的媒体、数据库、模型和临时目录挂载。
4. 执行 `docker compose up -d --force-recreate`。

应用会自动把旧的 `subx-asr` / `subx-ocr` 默认地址迁移到 `127.0.0.1:8000/8001`。如果确实还要连接外部自建服务，请重新填写地址，或设置 `SUBX_KEEP_LEGACY_SIDECAR_URLS=true` 关闭自动迁移。

## 数据库迁移

- 启动时自动执行数据库 migration，不需要手动建表。
- 从旧版本跨多个版本升级时，会按顺序补齐所有未执行的 migration。
- migration 执行前建议始终保留一份可用的 SQLite/PostgreSQL 备份。
- 数据库 schema 版本和 migration 列表见 [维护与架构说明](../development/maintenance.md#数据库迁移)。

## 回滚

1. 停止容器。
2. 将镜像 tag 改回旧版本，或恢复旧版本 compose 文件。
3. 如果新版本已经执行 migration，回滚程序前需要恢复升级前的数据库备份；不要用旧程序直接连接已迁移的新数据库。
4. 启动后检查 `/api/health` 和系统体检。

## 相关文档

- [部署文档](../deployment.md)
- [运维与数据管理](../operations.md)
- [故障排查](../troubleshooting.md)
- [环境变量参考](environment.md)
