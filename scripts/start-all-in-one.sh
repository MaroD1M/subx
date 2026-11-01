#!/bin/sh
set -u

ASR_PORT="${ASR_INTERNAL_PORT:-8000}"
OCR_PORT="${OCR_INTERNAL_PORT:-8001}"
export PYTHONUNBUFFERED=1
export ASR_INTERNAL_URL="${ASR_INTERNAL_URL:-http://127.0.0.1:${ASR_PORT}}"
export OCR_INTERNAL_URL="${OCR_INTERNAL_URL:-http://127.0.0.1:${OCR_PORT}}"

echo "[subx] starting built-in ASR on 127.0.0.1:${ASR_PORT}" >&2
cd /app/asr-service || exit 1
uvicorn main:app --host 127.0.0.1 --port "$ASR_PORT" --workers 1 &
ASR_PID=$!

echo "[subx] starting built-in OCR on 127.0.0.1:${OCR_PORT}" >&2
cd /app/ocr-service || exit 1
uvicorn main:app --host 127.0.0.1 --port "$OCR_PORT" --workers 1 &
OCR_PID=$!

wait_for_service() {
  name="$1"
  url="$2"
  pid="$3"
  limit="${4:-30}"
  i=0
  while [ "$i" -lt "$limit" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[subx] ${name} ready"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[subx] ${name} exited before becoming ready" >&2
      return 1
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "[subx] ${name} health check timed out after ${limit}s" >&2
  return 1
}

# 等内置服务真正可用再启动 Web，避免首个任务撞上服务初始化。
wait_for_service "ASR" "http://127.0.0.1:${ASR_PORT}/health" "$ASR_PID" 30 || true
wait_for_service "OCR" "http://127.0.0.1:${OCR_PORT}/health" "$OCR_PID" 30 || true

cd /app || exit 1
echo "[subx] starting web app on 0.0.0.0:3000" >&2
node .output/server/index.mjs &
APP_PID=$!

shutdown() {
  trap - TERM INT
  kill -TERM "$APP_PID" "$ASR_PID" "$OCR_PID" 2>/dev/null || true
  wait "$APP_PID" "$ASR_PID" "$OCR_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

wait "$APP_PID"
STATUS=$?

kill -TERM "$ASR_PID" "$OCR_PID" 2>/dev/null || true
wait "$ASR_PID" "$OCR_PID" 2>/dev/null || true
exit "$STATUS"
