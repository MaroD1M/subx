# SubX 实测指南

> 目标：用真实 NAS、真实媒体和单镜像/可选 sidecar 验证 v2.6.1，不只看构建是否通过。

## 1. 测试前准备

- 备份 `./data/db` 和 `./data/models`。
- 记录设备型号、CPU、内存、是否有 NVIDIA GPU。
- 准备 3 类样本：
  - 带内嵌文本字幕的视频；
  - 带外挂 `.srt/.ass` 的视频；
  - 无文本字幕、带对白的视频。
- 如需 OCR：准备 PGS 样本，以及 VobSub/DVD 样本各至少 1 个。
- 如需云 ASR：准备 OpenAI 兼容地址和 Key，不要使用生产 Key。

## 2. 基础启动

```bash
docker compose pull
docker compose up -d
```

默认只启动一个 all-in-one `subx` 容器，内置 ASR/OCR。下面的 sidecar 步骤只在拆分部署或 GPU 场景执行。

检查：

```bash
curl http://NAS_IP:3000/api/health
```

预期：`{"ok":true,"status":"ok"}`。

## 3. 侧车与鉴权

### ASR

```bash
docker compose --profile asr up -d asr
```

在设置页填写：

```text
ASR 地址：http://subx-asr:8000
ASR API Key：与 ASR_API_KEY 一致（若设置）
```

建议实测矩阵：

| 场景 | 设置 |
| --- | --- |
| x86 CPU | faster-whisper + small/int8 |
| ARM NAS | whisper.cpp + small |
| GPU | faster-whisper + large-v3-turbo/float16 |
| 低配/云兜底 | 云 ASR 或 whisper.cpp |

### OCR

默认无需启动 sidecar。拆分部署时：

```bash
docker compose --profile ocr up -d ocr
```

设置页填写 OCR 地址和 `OCR_API_KEY`。  
验证 PGS 与 VobSub/DVD 各一次，记录耗时、准确率和失败原因。

### 增强音频

```bash
docker compose --profile asr-enhanced up -d asr-enhanced
```

分别测试 Demucs、DeepFilterNet、pyannote。记录：

- 是否明显提升对白识别；
- 耗时增加；
- 失败是否自动回退原始音频。

## 4. 功能回归清单

- [ ] 有内嵌字幕：不走 ASR。
- [ ] 有外挂字幕：自动来源选择 `external`。
- [ ] 无字幕：按设置走 OCR / ASR / 云兜底。
- [ ] 目录监控：新文件稳定后只触发一次。
- [ ] 已有字幕/输出：默认跳过。
- [ ] 历史回填：只处理指定目录/时间段。
- [ ] 通知：Telegram / SMTP / Webhook / ntfy / Discord / Matrix / 企业微信按需测试。
- [ ] 外部集成：Sonarr/Radarr/Jellyfin/Plex/Emby/Bazarr 各发一次 Test，再发一次真实事件。
- [ ] API Token：任务读取、任务写入、自动化读取、Token 管理分别验证。
- [ ] 双模型质量校验：低分条目进入核对。
- [ ] AI 校对：术语建议可加入术语表。
- [ ] 核对页音频回放：音轨正确。
- [ ] Emby 兼容输出：主字幕 + `SubX/` 变体。

### 4.1 有字幕强制 ASR

- [ ] 选择带文本字幕的视频，右侧「语音识别」卡片可见
- [ ] 打开开关后字幕轨道选择置灰，并提示“已切换为语音识别”
- [ ] 创建任务后 `source_type=asr`，输出基于音频识别文本
- [ ] 关闭开关后恢复使用原字幕
- [ ] 修改“运行设备 / 计算精度”后，ASR 请求实际使用新值
- [ ] 设置页保存 ASR 开关后返回首页，开关和地址立即更新（无旧缓存）

### 4.2 登录与通知

- [ ] 登录页「获取帮助」能打开弹窗，弹窗内可见忘记口令重置步骤
- [ ] 已登录后访问 `/login` 自动回到首页
- [ ] 口令少于 8 位时提示明确，且文案与后端/文档一致
- [ ] 退出登录后回到登录页；模拟退出接口失败也不会卡在已登录状态
- [ ] Telegram 渠道单独配置 HTTP 代理后「测试」成功
- [ ] 不填渠道代理、只配置容器 `HTTPS_PROXY` 时「测试」成功
- [ ] 容器内 `127.0.0.1` 代理会失败，改成宿主机局域网 IP 后成功
- [ ] 「测试代理」能显示 HTTP 状态、延迟和底层错误原因

### 4.3 单镜像模型下载

- [ ] 单镜像启动后 `/api/health` 正常，容器日志出现内置 ASR/OCR 启动行
- [ ] 设置页「本地模型管理」能读取模型列表和安装状态
- [ ] 下载小模型（tiny/small），进度、速度、ETA 和文件数正常刷新
- [ ] 下载中点击暂停，状态变为已暂停；点击继续后从断点续传
- [ ] 取消下载后部分文件被清理，可重新下载
- [ ] 卸载模型后状态变为未安装
- [ ] 配置 `ASR_HF_ENDPOINT` 或下载代理后能正常下载
- [ ] 容器重启后未完成任务显示为已暂停，可继续
- [ ] 未下载模型时发起 ASR 任务，提示先下载而不是静默下载
- [ ] 图像字幕 OCR 无需额外模型/容器即可运行

## 5. PostgreSQL 实测

```bash
docker compose --profile postgres up -d postgres
```

在 `.env` 设置：

```env
DATABASE_URL=postgres://subx:subx@postgres:5432/subx
```

测试：

- 启动后自动建表；
- 任务创建、队列、自动任务、通知；
- 两个 Worker 同时跑，确认自动任务和通知不重复；
- 重启一个 Worker，确认另一个不被抢占；
- SQLite 数据迁移脚本。

> 当前 PG 同步桥会阻塞 Node 事件循环，适合低并发实测；高并发结果请单独记录。

## 6. 性能记录

每个场景记录：

```text
设备：
媒体时长：
音频语言：
引擎/模型/精度：
ASR 耗时：
RTF：
平均置信度：
OCR 耗时：
内存峰值：
是否回退：
```

## 7. 反馈模板

```text
版本：v2.6.1
镜像：subx（含内置 ASR/OCR）/ 可选 subx-asr / subx-ocr
设备：
部署方式：Docker Compose（默认单镜像 / 可选 profile）
数据库：SQLite / PostgreSQL
场景：
复现步骤：
预期：
实际：
日志片段：
```

## 8. 已知限制

- PostgreSQL 同步桥仍为阻塞式，高并发会放大延迟。
- VobSub/DVD OCR 是抽帧 PoC，2fps 可能漏掉极短字幕。
- OCR 超过 `OCR_MAX_SECONDS` 会直接报错。
- 内置 ASR/OCR 只监听回环地址；拆分 sidecar 默认不鉴权，必须设置 `ASR_API_KEY` / `OCR_API_KEY` 并同步配置。
- 依赖审计仍有已知漏洞，实测版暂未完成 major 升级。
