# 维护与架构说明

本文档面向继续开发 SubX 的维护者，说明主要目录、数据缓存、数据库迁移和验证流程。

## 目录职责

| 目录 | 职责 |
|------|------|
| `app/pages` | 路由页面，负责页面编排和少量局部状态 |
| `app/components` | 可复用界面组件，例如 `ReviewEntryCard`、`ReviewProofreadPanel` |
| `app/composables` | 跨页面状态和请求封装，例如配置、监控目录、导航 |
| `server/api` | HTTP 接口，尽量只做参数校验、权限检查和 service 调用 |
| `server/utils` | 业务服务、数据库、翻译、字幕、通知、缓存等 |
| `shared` | 前后端共用的纯函数、枚举、标签和时间工具 |
| `scripts` | 部署、数据库 schema、迁移和运维脚本 |
| `tests` | Playwright E2E/视觉回归；`app/**/__tests__` 放 Vue 组件测试 |

## 前端页面拆分约定

大型页面不要继续在单文件中堆叠。优先拆为：

- 页面级组件：只负责组合各个区块。
- 业务组件：只接收 props、发出事件，不直接访问页面私有状态。
- composable：跨页面或页面内较复杂的状态、请求和 watcher。

当前核对页已拆出：

- `ReviewEntryCard.vue`：单条字幕卡片
- `ReviewGuideModal.vue`：操作指南
- `ReviewProofreadPanel.vue`：AI 校对面板
- `AutomationTokensPanel.vue`：API Token 创建、撤销和列表
- `SettingsStoragePanel.vue`：存储统计与缓存清理
- `SettingsBackupPanel.vue`：自动备份设置、立即备份和备份列表
- `SettingsHealthPanel.vue`：系统体检
- `TaskLogsPanel.vue`：任务日志展示、折叠和滚动
- `useServerFonts.ts`：服务器字体列表与安装状态
- `shared/reviewFilters.ts`：筛选纯逻辑
- `shared/reviewLabels.ts`：状态、原因和质量标签

## 共享数据缓存

| 缓存 key | 数据 | 失效方式 |
|----------|------|----------|
| `app:config` | `/api/config` | 设置、媒体库、术语、自动化保存后刷新或 `clearNuxtData('app:config')` |
| `app:watch-folders` | `/api/watch-folders` | 监控目录增删改后 `refreshWatch` / `refreshFolders` |
| `task_proofread_cache` | AI 校对结果 | 按任务、类型和指纹判断，字幕内容或模型变化后过期 |

新增共享缓存时必须同时定义：

1. 数据所有者。
2. 何时允许使用旧数据。
3. 哪些写操作必须刷新缓存。
4. 删除任务或清空历史时是否清理。

## 数据库迁移

### 基本原则

- `server/utils/db.ts` 只保留最新完整基线 schema，方便新数据库一次建好。
- 旧数据库通过 `server/utils/migrations.ts` 的版本化 migration 升级。
- 每个 migration 必须有唯一 `version` 和明确 `name`。
- SQLite 和 PostgreSQL 都必须在同一个 migration 中处理。
- 已发布的 migration 不允许修改，只能新增更高版本。

### 新增 migration

1. 在 `MIGRATIONS` 中增加新版本。
2. SQLite 使用条件加列或 `CREATE TABLE IF NOT EXISTS`。
3. PostgreSQL 使用 `ADD COLUMN IF NOT EXISTS` 或同等防御写法。
4. 更新 `scripts/postgres-schema.sql` 的新库基线。
5. 增加 `server/utils/__tests__/migrations.test.ts` 覆盖旧库升级和幂等执行。
6. 执行 `npm test`、`npm run typecheck` 和 `npm run test:pg`（有 PostgreSQL 环境时）。

### 当前版本

- `1`：基础 schema
- `2`：会话 token 改为 SHA-256 哈希
- `3`：补齐历史列、`translation_mode`、AI 校对缓存和 `sort_order` 回填
- `4`：补充任务日志、任务响应和集成事件去重查询索引
- `5`：ASR 分段检查点和任务 `asr_checkpoint_key`
- `6`：修复已有 v5 数据库缺失 ASR 检查点列/表/索引
- `7`：新增 `subtitle_style_json`
- `8`：任务计时字段与历史任务回填
- `9`：新增 `review_jobs` 后台重译任务表
- `10`：新增系列档案 `series_profiles`
- `11`：新增覆盖索引、自动补齐策略、翻译记忆、媒体元数据缓存和费用表
- `12`：新增任务暂停请求字段 `pause_requested_at` 和覆盖扫描快照 `coverage_snapshots`

SQLite 基线位于 `server/utils/schema.ts`，PostgreSQL 基线位于 `scripts/postgres-schema.sql`。`schemaDrift.test.ts` 会对比两边表和字段，修改任意一侧后必须同步另一侧。

## API 错误与日志

- 新接口统一使用 `server/utils/apiError.ts` 的 `apiError()` 或 `normalizeApiError()`。
- 未捕获的服务端错误会由 `server/plugins/error-logger.ts` 通过结构化日志记录。
- 日志会自动隐藏常见的密钥和 token 字段。
- 5xx 使用 error 级别；401 / 404 使用 debug；其他 4xx 使用 warn。
- 业务路由应尽量只做：权限检查、参数校验、调用 service、返回结果。

## 常用验证命令

```bash
npm run lint
npm run test
npm run coverage
npm run typecheck
npm run build
npm run test:e2e
PLAYWRIGHT_PRODUCTION=1 npm run test:e2e
npm run test:api
npm run preview:images
npm run test:ocr
npm run check:versions
```

CI 会执行：

- 版本号一致性检查 `check:versions`
- 覆盖率统计范围覆盖 `server/**/*.ts` 与 `shared/**/*.ts`；当前门槛为 statements 34%、branches 29%、functions 38%、lines 35%，后续随测试补齐逐步提高
- 覆盖率报告上传为构建产物
- 前端视觉回归和移动端横向溢出检查
- PR 阶段构建 Docker 镜像并检查 `/api/health`
- 发布镜像前先执行 lint / typecheck / test / build

## 依赖与版本管理

- `.github/dependabot.yml` 每周检查 npm、GitHub Actions 和 Python 依赖。
- 版本号分布在多个文件中，发版前必须执行：

```bash
npm run check:versions
```

检查范围包括 README、使用/部署/测试文档、Dockerfile、Compose、`.env.example`、OpenAPI、镜像清理 workflow 和拉取脚本。

## 发版流程

1. 确认 `CHANGELOG.md` 已把 `Unreleased` 改为正式版本和发布日期。
2. 更新 `package.json` 版本：`npm version x.y.z --no-git-tag-version`。
3. 同步 README、docs、Dockerfile、Compose、`.env.example`、OpenAPI、镜像清理 workflow 和拉取脚本。
4. 执行 `npm run check:versions`。
5. 执行完整验证：`lint`、`typecheck`、`test`、`test:api`、`test:e2e`、`build`。
6. 更新文档截图：`npm run preview:images`。
7. 推送 `master`，等待 CI、PostgreSQL Smoke、All-in-One、ASR/OCR Sidecar 镜像构建全部成功。
8. 打正式 tag：`git tag vX.Y.Z && git push origin vX.Y.Z`。
9. 检查 GHCR 上 `latest`、`X.Y.Z` 和 `vX.Y.Z` 标签指向同一 digest。

## 发版注意

- 版本号目前分布在多个文件中，发版前必须执行 `npm run check:versions`。
- 镜像构建以 `master` 推送触发，`latest` 跟随默认分支；正式 tag 会触发版本镜像。
- 数据目录、数据库和模型目录升级前应备份。
- 新 migration 必须同时更新 SQLite 基线、PostgreSQL 基线、migration 测试和本文档的迁移列表。
