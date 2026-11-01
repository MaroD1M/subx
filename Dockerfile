# syntax=docker/dockerfile:1
# ============================================================
# SubX v2.6.1 all-in-one image
# 主应用 + ASR + OCR 运行在同一个容器内。
# Whisper 模型不打进镜像，首次在设置页手动下载。
# ============================================================

# ============= Node 构建阶段 =============
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 原生模块编译依赖：better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set audit false && \
    npm config set fund false && \
    npm ci

COPY . .
RUN npm run build

# Nitro 外置的原生模块需要匹配当前 Debian 环境的编译产物
RUN mkdir -p /app/.output/server/node_modules/better-sqlite3 && \
    cp -r /app/node_modules/better-sqlite3/build /app/.output/server/node_modules/better-sqlite3/build

# PostgreSQL 运行时依赖
RUN mkdir -p /app/.output/server/node_modules && \
    for pkg in pg pg-connection-string pg-pool pg-protocol pg-types pg-int8 postgres-array postgres-bytea postgres-date postgres-interval xtend pgpass split2; do \
      cp -r /app/node_modules/$pkg /app/.output/server/node_modules/; \
    done

# ============= Python 依赖阶段 =============
FROM python:3.11-slim-bookworm AS python-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY asr-service/requirements.txt /tmp/asr-requirements.txt
COPY ocr-service/requirements.txt /tmp/ocr-requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /tmp/asr-requirements.txt -r /tmp/ocr-requirements.txt

# ============= 统一运行时 =============
FROM python:3.11-slim-bookworm AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# FFmpeg、OCR 语言包、Node 运行依赖和降权工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    gosu \
    libatomic1 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsqlite3-0 \
    libstdc++6 \
    mkvtoolnix \
    passwd \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-chi-sim \
    tesseract-ocr-chi-tra \
    tesseract-ocr-jpn \
    tesseract-ocr-kor \
    tesseract-ocr-rus \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    tesseract-ocr-spa \
    tesseract-ocr-ita \
    tesseract-ocr-por \
    tesseract-ocr-tha \
    tesseract-ocr-ara \
    tesseract-ocr-hin \
    tesseract-ocr-tur \
    tesseract-ocr-vie \
    tesseract-ocr-ukr \
    tesseract-ocr-nld \
    tesseract-ocr-pol \
    tesseract-ocr-swe \
    tesseract-ocr-dan \
    tesseract-ocr-fin \
    tesseract-ocr-nor \
    tesseract-ocr-ces \
    tesseract-ocr-ell \
    tesseract-ocr-heb \
    tesseract-ocr-ind \
    tesseract-ocr-msa \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# 从官方 Node 镜像复制 node 可执行文件，避免在运行时安装 npm
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=python-deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin nuxt && \
    mkdir -p /media /app/db /app/temp /models /app/asr-service /app/ocr-service && \
    chown -R nuxt:nodejs /media /app/db /app/temp /models /app/asr-service /app/ocr-service

WORKDIR /app

COPY --from=builder --chown=nuxt:nodejs /app/.output /app/.output
COPY --from=builder --chown=nuxt:nodejs /app/server/utils/pgWorker.cjs /app/.output/server/pgWorker.cjs
COPY --from=builder --chown=nuxt:nodejs /app/scripts/postgres-schema.sql /app/scripts/postgres-schema.sql
COPY --chown=nuxt:nodejs package.json ./
COPY --chown=nuxt:nodejs asr-service/main.py asr-service/model_manager.py /app/asr-service/
COPY --chown=nuxt:nodejs ocr-service/main.py /app/ocr-service/
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chown=root:root scripts/start-all-in-one.sh /usr/local/bin/subx-start
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/subx-start

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
    CMD curl -fsS http://127.0.0.1:3000/api/health >/dev/null || exit 1

# 默认时区设为亚洲/上海，用户可以通过 -e TZ=... 覆盖
ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    VIDEO_DIR=/media \
    DB_PATH=/app/db/subx.db \
    PUID=1001 \
    PGID=1001 \
    PG_POOL_SIZE=5 \
    SUBX_ALL_IN_ONE=true \
    ASR_MODEL_DIR=/models \
    ASR_WHISPER_CPP_MODEL_DIR=/models/whisper-cpp \
    ASR_AUTO_DOWNLOAD=false \
    ASR_INTERNAL_PORT=8000 \
    OCR_INTERNAL_PORT=8001 \
    OCR_MEDIA_ROOT=/media \
    OCR_ENGINE=auto \
    OCR_LANGUAGE=en \
    OCR_FPS=2 \
    OCR_WORKERS=4 \
    OCR_MIN_CONFIDENCE=25 \
    OCR_MAX_SECONDS=7200

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/local/bin/subx-start"]
