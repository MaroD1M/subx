# SubX

> 说明：本仓库基于原作者项目 Fork，仅做了便于个人/社区使用的工程化增强（如 GitHub Actions 自动构建并发布 GHCR 镜像等），核心能力与设计思想归功于原作者。
>
> 在此特别感谢原作者的开源贡献与持续投入。

SubX 是一款专为本地/私有云环境设计的 **AI 自动化字幕轨道提取与翻译工具**。

它能够自动探测您的本地媒体库，提取视频流中的字幕轨道（或读取外挂字幕文件），并利用尖端的大语言模型（LLM）进行上下文感知的精准翻译。无论是美剧、动画还是纪录片，SubX 都能为您提供专业级的翻译工作流。

---

## 🌟 核心特性

- **🚀 极速解析与提取**：集成 `FFmpeg` 强力驱动，毫秒级探测视频元数据，秒级提取内嵌字幕轨道（不处理音轨内容）。
- **🎬 全面格式支持**：支持嵌入式字幕轨道提取，以及 `.srt`、`.ass`、`.vtt`、`.ssa` 等多种主流外挂字幕格式的读取与翻译。
- **🧾 仅导出原字幕**：支持“**不翻译，仅导出选中的字幕**”，可快速提取内嵌/外挂字幕并直接产出文件。
- **👁️ 字幕实时预览**：在翻译前即可在 Web 界面预览字幕内容，支持 ASS 特殊换行符（如 `\N`）的正确渲染。
- **🧠 语境感知翻译**：利用 LLM 的超长上下文窗口进行分块翻译，确保角色称呼、剧情逻辑在全篇中高度连贯。
- **📚 多媒体库管理**：除兼容传统单目录 `VIDEO_DIR` 模式外，还支持在设置页中配置多个**容器内媒体根目录**，并可设置默认库、排序、单个检测与批量检测。
- **💎 极致 UI/UX 体验**：采用现代化的 **玻璃拟态（Glassmorphism）** 设计，支持深色/浅色模式切换，配备动态流光背景，提供沉浸式操作体验。
- **🪟 可调式工作区布局**：支持拖动调整左右分区宽度、上下区域高度，并可一键恢复默认布局。
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

快速跳转：

- [单目录 / 传统 `VIDEO_DIR` 模式](#4-docker-composeyml-参考示例)
- [多媒体库 / 多目录挂载配置](#-多媒体库配置)

```yaml
services:
  subx:
    image: ghcr.io/marod1m/subx:v1.0.5
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
    image: ghcr.io/marod1m/subx:v1.0.5
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

#### 4) `docker-compose.yml` 参考示例

如果你准备直接复制改路径使用，可以参考下面两版。

**单目录模式（兼容旧部署）**

```yaml
services:
  subx:
    image: ghcr.io/marod1m/subx:latest
    container_name: subx
    restart: unless-stopped

    ports:
      - "3000:3000"

    environment:
      TZ: Asia/Shanghai
      VIDEO_DIR: /media
      DB_PATH: /app/db/subx.db

    volumes:
      - /volume1/video:/media
      - ./data/db:/app/db
      - ./data/temp:/app/temp

    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s

    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

适用场景：

- 所有视频都在同一个目录下
- 你只想继续沿用 `VIDEO_DIR` 模式
- 升级旧版时希望配置改动最小

**多媒体库模式（推荐新部署使用）**

```yaml
services:
  subx:
    image: ghcr.io/marod1m/subx:latest
    container_name: subx
    restart: unless-stopped

    ports:
      - "3000:3000"

    environment:
      TZ: Asia/Shanghai
      VIDEO_DIR: /media/movies
      DB_PATH: /app/db/subx.db

    volumes:
      - /volume1/movies:/media/movies
      - /volume1/tv:/media/tv
      - /volume2/anime:/media/anime
      - ./data/db:/app/db
      - ./data/temp:/app/temp

    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s

    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

适用场景：

- 电影、剧集、动漫分布在不同磁盘或目录
- 希望在设置页中自由启停媒体库、设置默认库、调整顺序
- 后续可能继续扩展更多媒体根目录

配置后，请在设置页新增媒体库并填写以下**容器内路径**：

- `/media/movies`
- `/media/tv`
- `/media/anime`

注意：

- `VIDEO_DIR` 在多媒体库模式下仍建议保留一个有效默认值，用于兼容旧逻辑和初始化回退。
- 设置页中的媒体库路径不要写宿主机路径，例如不要写 `/volume1/movies`。
- 如果首页显示“当前媒体库暂不可访问”，优先检查卷挂载、路径拼写和目录权限。

---

## 📚 多媒体库配置

### 1) 先理解这 3 个概念

部署时请务必区分下面三者：

- **宿主机路径**：你 NAS / Linux / Windows 机器上的真实路径，例如 `/volume1/video`。
- **容器内路径**：Docker 挂载后，容器里实际看到的路径，例如 `/media` 或 `/media/movies`。
- **应用扫描路径**：SubX 最终真正使用的路径，永远是**容器内路径**。

> 重点：**设置页里的媒体库路径，必须填写容器内路径，不是宿主机路径。**

例如：

- 宿主机路径：`/volume1/video`
- Docker 挂载：`/volume1/video:/media`
- 应用扫描路径：`/media`

这时：

- `VIDEO_DIR` 应写 `/media`
- 设置页中的媒体库路径也应写 `/media`
- **不能写** `/volume1/video`

---

### 2) 兼容旧版单目录模式

如果你**不配置媒体库列表**，系统会自动回退到：

- `VIDEO_DIR`

也就是说，旧部署不会因为新版本新增“多媒体库”功能而直接失效。

---

### 3) 多媒体库挂载示例

如果你希望把电影、电视剧、动漫分开挂载：

```yaml
volumes:
  - /volume1/movies:/media/movies
  - /volume1/tv:/media/tv
  - /volume2/anime:/media/anime
  - ./data/db:/app/db
```

这时在设置页中应配置的媒体库路径是：

- `/media/movies`
- `/media/tv`
- `/media/anime`

而不是：

- `/volume1/movies`
- `/volume1/tv`
- `/volume2/anime`

---

### 4) 设置页媒体库功能说明

设置页支持以下操作：

- **显示名称**：前端展示名称，例如“电影库”“动漫库”。
- **容器内路径**：实际扫描路径，例如 `/media/movies`。
- **默认库**：首页文件浏览器优先打开的媒体库。
- **排序**：控制设置页与首页中的媒体库顺序。
- **单个检测**：检测某个媒体库是否可访问。
- **批量检测**：一次性检测所有媒体库。
- **强制保存**：默认情况下，如果启用中的媒体库不可访问，系统会阻止保存；开启“允许带无效媒体库强制保存”后可跳过此限制。

---

### 5) 媒体库检测结果说明

常见检测结果包括：

- **目录可访问，可用于媒体扫描**
  - 说明配置正确，容器可以读取。
- **目录不存在，可能未挂载到容器内**
  - 说明通常是 Docker `volumes` 没挂对，或者路径写成了宿主机路径。
- **权限不足，容器用户没有读取权限**
  - 说明容器无法读取该目录，需要检查宿主机权限、UID/GID 或尝试临时使用 `user: "0:0"` 验证。
- **路径不是目录**
  - 说明填写的是文件路径，不是文件夹路径。
- **路径不能为空**
  - 说明该媒体库配置不完整。

---

## ⚠️ 部署注意事项

### 1) 登录与反向代理注意事项

首次访问未登录时，系统会自动跳转到：

- `/login`

如果你使用 DDNS、Nginx、Traefik、宝塔或 NAS 自带反代，请确保：

- 页面路由正常转发
- `/api/*` 正常转发
- `/_nuxt/*` 静态资源正常转发
- 反代透传 `X-Forwarded-Proto: https`
- 不要缓存 `/` 和 `/login`

否则可能出现：

- 首次访问不跳登录页
- 登录后状态异常
- 页面可打开但接口失败
- 前端资源加载不完整

---

### 2) 首页显示“当前媒体库暂不可访问”时怎么办？

这通常不是前端问题，而是部署层问题。优先排查：

- Docker `volumes` 是否正确挂载
- 设置页填写的是否为**容器内路径**
- 容器用户是否有读取权限
- 该目录是否真实存在
- 该路径是否是目录而不是文件

建议操作顺序：

1. 进入设置页点击“检测路径”或“批量检测”
2. 根据提示修正挂载或权限
3. 返回首页重新刷新文件浏览器

---

### 3) 保存媒体库配置时被阻止怎么办？

如果启用中的媒体库不可访问，系统默认会阻止保存。

你有两种处理方式：

- **推荐**：修复路径 / 权限 / 挂载后再保存
- **临时**：将该媒体库停用后保存
- **高级用户**：打开“允许带无效媒体库强制保存”后继续保存

建议仅在你明确知道自己在做什么时使用强制保存。

---

#### 4) 常见问题（FAQ）

1. 启动后看不到文件？

- 先检查宿主机目录是否真实存在，且 compose 中挂载路径拼写正确。
- 确认 `VIDEO_DIR` 与容器挂载目标一致（通常都是 `/media`）。
- 如果你使用多媒体库，确认设置页填写的是**容器内路径**。
- 执行 `docker compose logs -f subx` 查看扫描报错信息。

2. 为什么设置页里填宿主机路径不生效？

- 因为应用运行在容器里，真正可访问的是**容器内路径**。
- 例如你应填写 `/media/movies`，而不是 `/volume1/movies`。

3. 提示权限不足 / 无法写入数据库？

- 优先检查宿主机目录权限，确保容器用户可读写 `./data/db`。
- 可临时测试 `user: "0:0"`（root）判断是否权限问题；确认后再改回最小权限。
- 如使用 NAS，建议给挂载目录分配固定 UID/GID。

4. 为什么检测提示“目录不存在，可能未挂载到容器内”？

- 多数情况下是 Docker 没把宿主机目录挂进容器。
- 也可能是你在设置页里填了宿主机路径，而不是容器内路径。

5. 为什么首页显示“当前媒体库暂不可访问”？

- 当前选中的媒体库在容器里不可读，或根本不存在。
- 请优先在设置页重新检测媒体库，并检查 Docker 挂载与权限。

6. 能访问页面但翻译失败？

- 在设置页确认 API Key、模型名和 Base URL 是否正确。
- 若你使用自定义网关，确认容器可以访问该地址（DNS/代理/防火墙）。
- 打开调用日志（任务详情页）查看具体错误返回。

7. 升级版本会丢数据吗？

- 不会，只要 `./data/db:/app/db` 挂载未变，SQLite 数据会保留。
- 升级建议使用：`docker compose pull && docker compose up -d`。

8. 局域网 IP 访问时，为什么“设置保存失败/看不到文件”？

- 这通常是会话 Cookie、目录权限或反向代理配置问题。请先升级到最新镜像版本。
- 升级后建议清理浏览器该站点 Cookie（或使用无痕窗口）后重新登录。
- 若文件列表仍为空，优先检查 `/media` 或多媒体库挂载路径是否正确、容器用户是否有读取权限。

9. GHCR 构建报错 `exit code: 132`（常见于 buildx/QEMU）怎么办？

- 这是 QEMU 下原生依赖安装偶发崩溃（常见于 `better-sqlite3` 的安装阶段）。
- 建议优先拉取最新标签（已优化 Dockerfile 的依赖安装步骤）后重试构建。
- 若仍失败，可在 Actions 中点击 `Re-run failed jobs` 再试一次（该类问题有一定随机性）。
- 如需稳定优先，可临时只构建单平台 `linux/amd64`，待镜像发布后再补 `arm64`（本仓库当前策略即为先保稳定）。

---

#### 5) GHCR 镜像发布说明（仓库维护者）

本项目已配置 GitHub Actions 自动构建 GHCR 镜像，**仅在推送 `v*` 标签时触发**。

示例：

```bash
git tag v1.0.4
git push origin v1.0.4
```

镜像地址（本仓库）：

- `ghcr.io/marod1m/subx:v1.0.5`（推荐：固定版本，便于稳定复现）
- `ghcr.io/marod1m/subx:latest`（可选：跟随最新构建）

如果需要改用 `latest`，只需将 compose 中的：

```yaml
image: ghcr.io/marod1m/subx:v1.0.5
```

替换为：

```yaml
image: ghcr.io/marod1m/subx:latest
```

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
   npm run dev
   ```

补充说明：

- Windows 下若未正确安装 `ffmpeg` / `ffprobe`，建议显式配置 `FFMPEG_PATH` 和 `FFPROBE_PATH`。
- 本地开发若要模拟多媒体库，可直接使用多个本地目录，但程序依旧是“以配置路径为根目录”进行扫描。
- 若你在本地开发中使用 Docker，则设置页媒体库路径依然要填写**容器内路径**。

---

## 🔐 初始设置说明

1. **首次启动**：项目启动后会自动进入“初始化口令密钥”页面，引导您设置访问口令。
2. **访问保护**：设置完成后，任何对 API 或页面的访问都必须经过口令验证。
3. **会话管理**：登录状态支持 Web 持久化，无需频繁输入口令。

---

## 📜 许可证

本项目采用 **MIT** 许可证，您可以自由地进行二次开发与分发。
