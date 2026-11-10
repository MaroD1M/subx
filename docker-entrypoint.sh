#!/bin/sh
set -e

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"
DB_FILE="${DB_PATH:-/app/db/subx.db}"
DB_DIR="$(dirname "$DB_FILE")"
MODEL_DIR="${ASR_MODEL_DIR:-/models}"

# 让服务端和前端使用同一时区：优先显式 NUXT_PUBLIC_TIME_ZONE，其次 TZ。
export TZ="${TZ:-Asia/Shanghai}"
export NUXT_PUBLIC_TIME_ZONE="${NUXT_PUBLIC_TIME_ZONE:-$TZ}"

if [ "$(id -u)" = "0" ]; then
  if [ "${RUN_AS_ROOT:-false}" = "true" ]; then
    exec "$@"
  fi

  mkdir -p "$DB_DIR" /app/temp /app/backups "$MODEL_DIR" /fonts
  chown -R "$PUID:$PGID" "$DB_DIR" /app/temp /app/backups 2>/dev/null || true
  if command -v fc-cache >/dev/null 2>&1; then
    fc-cache -f /fonts >/dev/null 2>&1 || true
  fi

  MODEL_OWNER="$(stat -c '%u:%g' "$MODEL_DIR" 2>/dev/null || true)"
  if [ "${CHOWN_MODELS:-false}" = "true" ] || { [ -n "$MODEL_OWNER" ] && [ "$MODEL_OWNER" != "$PUID:$PGID" ]; }; then
    chown -R "$PUID:$PGID" "$MODEL_DIR" 2>/dev/null || true
  fi

  if [ "${CHOWN_MEDIA:-false}" = "true" ] && [ -d "${VIDEO_DIR:-/media}" ]; then
    chown -R "$PUID:$PGID" "${VIDEO_DIR:-/media}" 2>/dev/null || true
  fi

  exec gosu "$PUID:$PGID" "$@"
fi

exec "$@"
