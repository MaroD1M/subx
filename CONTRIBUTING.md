# 贡献指南

感谢参与 SubX。提交代码前请先阅读本页和 [文档索引](docs/README.md)。

## 开发环境

- Node.js 22.22.3+
- FFmpeg / FFprobe
- 可选：Python 3（OCR 辅助测试）、Docker（镜像验证）

```bash
npm install
npm run dev
```

开发环境变量示例：

```env
VIDEO_DIR=/absolute/path/to/media
DB_PATH=./db/subx.db
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
```

## 提交前检查

```bash
npm run lint
npm run typecheck
npm test
npm run test:ocr
npm run docs:check
npm run build
```

涉及界面视觉或可访问性时：

```bash
npx playwright install chromium
npm run test:e2e
```

涉及 PostgreSQL 时：

```bash
npm run test:pg
```

## 代码约定

- 遵循现有目录职责和命名风格，优先复用已有组件、composable 和工具函数。
- 新增 API 使用 `server/utils/apiError.ts` 的错误处理；业务路由尽量只做权限检查、参数校验和 service 调用。
- 新增或修改数据库字段时，同时更新 SQLite 基线、PostgreSQL 基线和 migration 测试。
- 不要提交密钥、Token、真实媒体文件或包含个人信息的日志。
- 不要修改已发布的 migration，只能新增更高版本。

## 文档约定

- 文档使用中文；命令、变量名和界面专有名词保留原文。
- 版本变更和升级注意事项只写在 `CHANGELOG.md`。
- 新增文档时同步更新 [文档索引](docs/README.md) 和 [使用文档入口](docs/usage.md)。
- 提交前运行 `npm run docs:check`，确保链接、锚点、图片和版本号有效。

## 提交 Pull Request

1. 从 `master` 创建分支。
2. 保持改动聚焦，一个 PR 只解决一个问题。
3. 在 PR 描述中说明背景、改动点、验证方式和风险。
4. 涉及界面变化时附截图；涉及数据库变化时说明迁移和回滚方式。
5. 等待 CI（lint、typecheck、test、API、E2E、Docker smoke）全部通过。

## 版本与发布

版本号以 `package.json` 为准，发版流程见 [维护与架构说明](docs/development/maintenance.md#发版流程)。普通分支推送不会发布镜像，只有 `v*` 标签会触发构建。

## 许可证

提交贡献即表示同意以 AGPL-3.0 发布，并确认不引入与现有许可证冲突的代码或资源。
