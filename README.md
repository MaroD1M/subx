# SubX

> 说明：本仓库基于原作者项目 Fork，仅做了便于个人/社区使用的工程化增强（如 GitHub Actions 自动构建并发布 GHCR 镜像等），核心能力与设计思想归功于原作者。
>
> 在此特别感谢原作者的开源贡献与持续投入。

SubX 是一款专为本地/私有云环境设计的 **AI 自动化视频字幕提取与翻译工具**。

它能够自动探测您的本地媒体库，提取视频流中嵌入的所有音轨与字幕轨道，并利用尖端的大语言模型（LLM）进行上下文感知的精准翻译。无论是美剧、动画还是纪录片，SubX 都能为您提供专业级的翻译工作流。

---

## 🌟 核心特性

- **🚀 极速解析与提取**：集成 `FFmpeg` 强力驱动，毫秒级探测视频元数据，秒级提取内嵌字幕轨道。
- **🎬 全面格式支持**：支持嵌入式字幕提取以及 `.srt`、`.ass`、`.vtt`、`.ssa` 等多种主流外挂字幕格式的读取与翻译。
- **👁️ 字幕实时预览**：在翻译前即可在 Web 界面预览字幕内容，支持 ASS 特殊换行符（如 `\N`）的正确渲染。
- **🧠 语境感知翻译**：利用 LLM 的超长上下文窗口进行分块翻译，确保角色称呼、剧情逻辑在全篇中高度连贯。
- **💎 极致 UI/UX 体验**：采用现代化的 **玻璃拟态（Glassmorphism）** 设计，支持深色/浅色模式切换，配备动态流光背景，提供沉浸式操作体验。
- **🛡️ 银行级安全架构**：
  - **基于口令的快速身份验证**：无需繁琐的用户名，仅凭口令即可全权管控。
  - **端到端加密传输**：客户端本地 SHA-256 预哈希，确保口令明文永不离开您的设备。
  - **服务端二次加固**：存储层与逻辑层双重哈希防护，保障实例安全。
- **📦 Docker 原生支持**：专为 NAS（群晖、铁威马等）和云服务器优化，通过目录挂载即可实现“零上传”处理大容量影视库。

---

## 🛠️ 技术栈

- **前端框架**：Nuxt 4 (Vue 3 + Nitro)
- **UI 组件库**：Nuxt UI (基于 Tailwind CSS)
- **数据库**：SQLite (通过 `better-sqlite3` 驱动)
- **媒体处理**：FFmpeg (通过 `fluent-ffmpeg`)
- **安全算法**：浏览器原生 Crypto API + Node.js Crypto

---

## 📥 安装与部署

### 🐳 使用 Docker (推荐)

#### 1) 快速可用版（复制即用）

```yaml
services:
  subx:
    image: ghcr.io/<your-github-user-or-org>/subx:latest
    container_name: subx
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /path/to/your/media:/media
      - ./data/db:/app/db
    environment:
      - VIDEO_DIR=/media
      - DB_PATH=/app/db/subx.db
      - TZ=Asia/Shanghai # 按需改为 Asia/Shanghai / UTC / America/Los_Angeles
```

启动：

```bash
docker compose up -d
```

访问：

- `http://<你的主机IP>:3000`

---

#### 2) 详细拓展版（含健康检查、资源限制、日志轮转）

适用于 NAS / 家庭服务器 / 云主机长期运行场景：

```yaml
services:
  subx:
    image: ghcr.io/<your-github-user-or-org>/subx:latest
    container_name: subx
    restart: unless-stopped

    # 如果你在 Linux 下遇到挂载目录权限问题，可改为 root 或映射为宿主机用户
    # user: "0:0"
    # user: "1000:1000"

    ports:
      - "3000:3000"

    environment:
      TZ: Asia/Shanghai
      VIDEO_DIR: /media
      DB_PATH: /app/db/subx.db
      # 可选：Windows 自建镜像时可显式传入 ffmpeg/ffprobe 路径
      # FFMPEG_PATH: /usr/bin/ffmpeg
      # FFPROBE_PATH: /usr/bin/ffprobe

    volumes:
      # 媒体目录（只读更安全；如果你需要写入同目录输出文件，可去掉 :ro）
      - /path/to/your/media:/media
      # 持久化数据库
      - ./data/db:/app/db
      # 可选：持久化临时日志，便于排障
      - ./data/temp:/app/temp

    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s

    # 资源限制（按机器性能调整）
    mem_limit: 2g
    cpus: "2.0"

    # 日志轮转，避免日志无限增长
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

常用运维命令：

```bash
# 启动/更新
docker compose pull && docker compose up -d

# 查看日志
docker compose logs -f subx

# 重启
docker compose restart subx

# 停止并删除容器（不删挂载数据）
docker compose down
```

---

#### 3) NAS 路径示例（群晖 / Unraid）

群晖（示例）：

```yaml
volumes:
  - /volume1/video:/media
  - /volume1/docker/subx/db:/app/db
  - /volume1/docker/subx/temp:/app/temp
```

Unraid（示例）：

```yaml
volumes:
  - /mnt/user/Media:/media
  - /mnt/user/appdata/subx/db:/app/db
  - /mnt/user/appdata/subx/temp:/app/temp
```

说明：

- `/media` 必须指向你真实的影视目录。
- `/app/db` 建议单独持久化，便于备份和迁移。
- `/app/temp` 可选，但建议保留用于问题排查。

---

#### 4) 常见问题（FAQ）

1. 启动后看不到文件？

- 先检查宿主机目录是否真实存在，且 compose 中挂载路径拼写正确。
- 确认 `VIDEO_DIR` 与容器挂载目标一致（通常都是 `/media`）。
- 执行 `docker compose logs -f subx` 查看扫描报错信息。

2. 提示权限不足 / 无法写入数据库？

- 优先检查宿主机目录权限，确保容器用户可读写 `./data/db`。
- 可临时测试 `user: "0:0"`（root）判断是否权限问题；确认后再改回最小权限。
- 如使用 NAS，建议给挂载目录分配固定 UID/GID。

3. 能访问页面但翻译失败？

- 在设置页确认 API Key、模型名和 Base URL 是否正确。
- 若你使用自定义网关，确认容器可以访问该地址（DNS/代理/防火墙）。
- 打开调用日志（任务详情页）查看具体错误返回。

4. 升级版本会丢数据吗？

- 不会，只要 `./data/db:/app/db` 挂载未变，SQLite 数据会保留。
- 升级建议使用：`docker compose pull && docker compose up -d`。

5. 局域网 IP 访问时，为什么“设置保存失败/看不到文件”？

- 这通常是会话 Cookie 或目录权限问题。请先升级到最新镜像版本。
- 升级后建议清理浏览器该站点 Cookie（或使用无痕窗口）后重新登录。
- 若文件列表仍为空，优先检查 `/media` 挂载路径是否正确、容器用户是否有读取权限。

6. GHCR 构建报错 `exit code: 132`（常见于 buildx/QEMU）怎么办？

- 这是 QEMU 下原生依赖安装偶发崩溃（常见于 `better-sqlite3` 的安装阶段）。
- 建议优先拉取最新标签（已优化 Dockerfile 的依赖安装步骤）后重试构建。
- 若仍失败，可在 Actions 中点击 `Re-run failed jobs` 再试一次（该类问题有一定随机性）。
- 如需稳定优先，可临时只构建单平台 `linux/amd64`，待镜像发布后再补 `arm64`。

---

#### 5) GHCR 镜像发布说明（仓库维护者）

本项目已配置 GitHub Actions 自动构建 GHCR 镜像，**仅在推送 `v*` 标签时触发**。

示例：

```bash
git tag v1.0.6
git push origin v1.0.6
```

镜像地址格式：

- `ghcr.io/<repo-owner>/subx:<tag>`
- `ghcr.io/<repo-owner>/subx:latest`（默认分支策略下生成）

### 💻 本地开发环境

1. **环境准备**：确保系统中已安装 `Node.js` (建议 v18+) 和 `FFmpeg`。
2. **配置环境变量**：在项目根目录创建 `.env` 文件：
   ```env
   # [必填] 视频挂载目录，程序会扫描此目录下的视频和字幕文件
   VIDEO_DIR=D:\Path\To\Your\Videos
   # [可选] SQLite 数据库存储路径
   DB_PATH=./demo_db/subx.db
   # 默认值: ./db/subx.db
   # [可选] win 需要显式配置FFmpeg 路径
   FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
   FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
   ```
3. **启动项目**：
   ```bash
   # 安装依赖
   npm install
   # 启动开发服务器
   npm dev
   ```

---

## 🔐 初始设置说明

1. **首次启动**：项目启动后会自动进入“初始化口令密钥”页面，引导您设置访问口令。
2. **访问保护**：设置完成后，任何对 API 或页面的访问都必须经过口令验证。
3. **会话管理**：登录状态支持 Web 持久化，无需频繁输入口令。

---

## 📜 许可证

本项目采用 **MIT** 许可证，您可以自由地进行二次开发与分发。
