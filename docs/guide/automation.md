# 自动化与集成

> 适用版本：v2.11.2
>
> 前置条件：已完成 [快速开始](../getting-started.md)。

本页覆盖监控目录、过滤规则、历史回填、通知渠道、API Token 与外部集成。

## 自动化

自动化页面位于顶部或移动端底部导航的「自动化」。

### 全局设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 自动任务并发上限 | 1 | 同时运行的自动任务数，建议低配 NAS 保持 1 |
| 低置信度通知阈值 | 60% | ASR 平均置信度低于该值的片段数量大于 0 时触发通知 |
| 启用通知 | 开启 | 关闭后不再创建新的通知投递 |

### 批量任务与队列

在首页「多选」批量加入队列时，可以设置：

- **批次名称**：用于在翻译历史中识别批次。
- **优先级**：数值越大越先执行；默认 0。优先级只影响等待中的任务，不会中断或重排正在运行的任务。
- **计划执行时间**：留空立即入队；填写后到点才领取。
- **失败自动重试**：默认重试网络、超时、限流、供应商 5xx 和解析异常，最多 3 次；鉴权、模型不存在和内容拒答不会自动重试。

翻译历史顶部显示可折叠的队列摘要，默认不占用主列表空间；展开后按「运行中 / 等待中 / 已暂停」列出任务，等待列表按优先级从高到低显示顺序。队列任务默认每页 20 个，可切换 20 / 50 / 100 条并翻页。可暂停/恢复整个队列，暂停只停止领取新任务，运行中的任务会继续完成。批次卡片支持暂停、恢复、取消和重试失败任务；排队或自动重试中的单个任务可以单独暂停、恢复、调整优先级或取消，运行中的 ASR 任务也可以在当前分段完成后暂停。

### 规则模板

新增监控目录时可以先点模板：

- 电影库：递归、跳过 Sample/Trailer、最小 100MB。
- 剧集库：适合 SxxExx，稳定 20 秒。
- 动画 / 番剧：跳过 NCOP/NCED/Preview。
- 低配 NAS：单层目录、限制体积、延长稳定等待。
- 双语字幕：默认输出双语字幕。

### 新增监控目录

1. 进入「自动化 → 监控目录」，点击「新增监控目录」。
2. 选择媒体库，填写相对路径；留空表示整个媒体库根目录。
3. 选择触发模式：
   - **仅新文件**：只监听之后新增/变化的文件。
   - **仅历史回填**：不启动实时监听，只允许手动回填。
   - **新文件 + 回填**：两者都允许。
4. 设置递归、扩展名、正则、体积、时长、稳定等待等规则。
5. 设置目标语言、输出模式、字幕格式、字幕样式、双语布局、翻译风格和通知渠道。
6. 保存后，满足规则且稳定的新文件会自动创建任务。

> 监控目录必须位于已配置的媒体库内，页面填写相对路径。实时监听使用 chokidar，另有 60 秒轮询兜底；NAS 休眠或挂载断开时事件会进入失败记录。

媒体库页面不再提供“自动监控”开关；如需监控整库，请在「自动化 → 监控目录」中新建监控目录并留空相对路径。

### 过滤规则

| 规则 | 说明 |
|------|------|
| 视频扩展名 | 逗号分隔，例如 `.mkv,.mp4` |
| 包含/排除正则 | 对相对路径匹配；排除优先 |
| 最小/最大体积 | 单位 MB，0 表示不限 |
| 最短时长 | 单位秒，0 表示不限；大于 0 时会先 ffprobe |
| 创建/修改时间 | 可选范围，留空不限 |
| 文件稳定等待 | 大小和 mtime 稳定后才入队，默认 15 秒 |
| 已有字幕时跳过 | 同名字幕文件存在时跳过视频 |
| 已有目标输出时跳过 | 目标语言输出已存在时跳过 |
| 递归子目录 | 关闭后只处理当前目录第一层 |

临时文件、隐藏目录、`SubX/`、`@eaDir/`、`#recycle/` 会自动忽略。

### 幂等与防循环

事件去重键为：

```text
相对路径 + 文件大小 + mtime
```

同一文件在排队/处理中不会重复触发；输出字幕不会被再次当作视频处理；已有输出默认跳过，避免无限循环。

### 历史回填

点击监控目录卡片上的「回填」：

- 可指定修改时间起止和最多入队数量。
- 只扫描该监控目录，不默认全库扫描。
- 按全局自动并发逐步创建任务。
- 回填结果会写入事件记录，可查看跳过原因。

### 事件记录

「自动化 → 事件记录」展示：

- 文件路径、所属监控目录、大小、时间。
- 状态：待处理 / 已排队 / 完成 / 失败 / 已跳过。
- 失败原因和关联任务链接。
- 失败事件可点击「重试」重新入队。

---

## 通知渠道

支持 Telegram、SMTP 邮件、Webhook、ntfy、Discord、Matrix 和企业微信。

### Telegram

| 字段 | 说明 |
|------|------|
| Bot Token | 通过 BotFather 创建，加密保存 |
| Chat ID | 私聊/群组 ID，例如 `-1001234567890` |
| 代理地址 | 可选，支持 HTTP 代理 |

### 邮件 SMTP

填写 SMTP Host、端口、用户名、密码/授权码、发件人和收件人。465 端口通常开启 SSL；587 端口通常使用 STARTTLS。

### Webhook

- URL 必须为 http/https。
- 支持 POST / PUT / PATCH。
- Headers 使用 JSON 对象。
- 可设置 HMAC 密钥，请求会附带 `X-SubX-Signature: sha256=...`。
- 支持可选代理。

### ntfy

填写 ntfy 服务地址、Topic、可选访问 Token 和优先级 1-5。

### Discord / Matrix / 企业微信

- **Discord**：填 Discord Webhook URL。
- **Matrix**：填 Homeserver、Room ID 和 Access Token。
- **企业微信**：填群机器人 Webhook URL。

### 事件筛选与测试

每个渠道可以单独选择通知事件：

- 任务完成
- 任务失败
- 任务取消
- 低置信度
- 监控异常
- 回填完成

保存后点击「测试」会立即发送一条测试通知。发送失败会进入重试队列，不阻塞主任务。最近投递记录可在同一页面查看。

任务通知会包含文件、状态、输出模式、字幕格式、双语排版、字幕来源、目标语言、模型、翻译风格、任务来源、耗时、输出路径和错误信息，便于在 Telegram 等渠道直接判断任务结果。

### 通知模板与 Webhook JSON

每个通知渠道可选填写标题模板和正文模板，留空使用默认内容。模板使用安全插值：

```text
SubX · {{task.fileName}}
状态：{{task.statusLabel}}
输出：{{task.outputPath}}
批次：{{batch.name}} {{batch.completedCount}}/{{batch.taskCount}}
```

Webhook 还可以填写自定义 JSON 载荷模板，例如：

```json
{
  "event": "{{event}}",
  "file": "{{task.fileName}}",
  "status": "{{task.status}}",
  "progress": {{task.progress}}
}
```

字符串变量会自动做 JSON 转义；Webhook 的 HMAC 签名覆盖最终发送的 body。支持的事件包括任务、批次、监控、术语导入和测试通知，可在渠道编辑弹窗中按需勾选。

### 通知网络与代理

- Telegram、Webhook、ntfy 需要容器能访问对应网络；国内网络可配置代理。
- SMTP 需要允许容器访问邮件服务器端口。
- 通知失败会重试，不阻塞字幕任务。
- 通知密钥与 API Key 一样加密存储，更换 `SUBX_SECRET_KEY` 后需要重新填写。
- 渠道里填写的代理优先；未填写时读取容器的 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`。
- 容器内 `127.0.0.1` 指向容器自己。代理在宿主机上时，请填宿主机局域网 IP，例如 `http://192.168.1.10:7890`。
- 「测试代理」会显示连通性、HTTP 状态和延迟；仅支持 HTTP/HTTPS 代理，不支持 SOCKS。

---

## API Token 与 OpenAPI

进入「自动化 → API Token」创建 Token：

- 名称仅用于识别。
- 权限按 scope 拆分：
  - `tasks:read` / `tasks:write`
  - `glossary:read` / `glossary:write`
  - `automation:read` / `automation:write`
  - `tokens:manage`
  - `system:admin`
  - `*` 全部权限
- ASR 模型下载、暂停、续传、取消、卸载需要 `system:admin`；模型列表和状态读取需要 `tasks:read`。
- 可设置有效期；留空表示永不过期。
- 明文只在创建时显示一次，请立即保存。
- 可随时撤销；撤销后调用立即返回 401。

调用时使用：

```http
Authorization: Bearer subx_xxx
```

或：

```http
X-API-Token: subx_xxx
```

OpenAPI：

```text
GET /api/openapi.json
```

「最近 API 调用」会记录 Token 名称、方法、路径、状态码和时间，便于排查。

---

## 外部集成

支持 Sonarr、Radarr、Jellyfin、Plex、Emby、Bazarr 的 Webhook。

### 配置

1. 进入「自动化 → 外部集成」。
2. 生成 Webhook Token 并保存。
3. 如需映射下载器路径，填写：
   - 回调路径前缀，例如 `/downloads`
   - SubX 容器路径，例如 `/media`
4. 复制对应来源的 Webhook URL，填到下载器/媒体服务器。

示例：

```text
Sonarr:   http://NAS_IP:3000/api/integrations/sonarr?token=subx_hook_xxx
Radarr:   http://NAS_IP:3000/api/integrations/radarr?token=subx_hook_xxx
Jellyfin: http://NAS_IP:3000/api/integrations/jellyfin?token=subx_hook_xxx
Plex:     http://NAS_IP:3000/api/integrations/plex?token=subx_hook_xxx
Emby:     http://NAS_IP:3000/api/integrations/emby?token=subx_hook_xxx
Bazarr:   http://NAS_IP:3000/api/integrations/bazarr?token=subx_hook_xxx
```

### 行为

- Sonarr/Radarr 下载事件会读取 `episodeFile.path` / `movieFile.path`。
- Jellyfin 读取 `Item.Path`。
- Plex 读取 `Metadata.Media[].Part[].file`，不同版本字段可能不同。
- Emby 读取 `Item.Path` / `Path`。
- Bazarr 读取 `episode.path` / `movie.path` / `path`。
- 路径必须能映射到已配置的媒体库。
- 测试事件只返回成功，不创建任务。
- 成功/失败都会记录在「最近集成事件」。

---

## 相关文档

- [媒体库与语音识别](media-asr.md)
- [环境变量参考](../reference/environment.md)
- [运维与数据管理](../operations.md)
