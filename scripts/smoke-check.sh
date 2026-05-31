#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
TMP_DIR="${TMP_DIR:-/tmp/subx-smoke}"
mkdir -p "$TMP_DIR"
COOKIE_JAR="$TMP_DIR/cookies.txt"

log() { echo "[smoke] $*"; }
fail() { echo "[smoke][FAIL] $*"; exit 1; }

request() {
  local method="$1"; shift
  local url="$1"; shift
  curl -sS -X "$method" "$url" \
    -H 'Content-Type: application/json' \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$@"
}

log "1) 检查服务可达: $BASE_URL"
curl -sS "$BASE_URL/api/auth/status" >/dev/null || fail "服务不可达，请先启动: npm run dev"

STATUS_JSON="$(curl -sS "$BASE_URL/api/auth/status")"
HAS_PASSKEY="$(echo "$STATUS_JSON" | sed -n 's/.*"hasPasskey":\(true\|false\).*/\1/p')"

if [[ "$HAS_PASSKEY" != "true" ]]; then
  log "2) 首次初始化口令"
  request POST "$BASE_URL/api/auth/setup" --data '{"passkey":"0f4f4fbc8f11f59e4b764a9b7654f8f667f5f4f7a9f732ef6f7f9d0ea913d6f6"}' >/dev/null || fail "初始化口令失败"
else
  log "2) 执行登录"
  request POST "$BASE_URL/api/auth/login" --data '{"passkey":"0f4f4fbc8f11f59e4b764a9b7654f8f667f5f4f7a9f732ef6f7f9d0ea913d6f6"}' >/dev/null || fail "登录失败（请确认你当前口令）"
fi

log "3) 保存配置（字幕样式相关）"
CFG_PAYLOAD='{
  "targetLanguage": "zh-CN",
  "outputMode": "bilingual",
  "subtitleFormat": "both",
  "subtitleStylePreset": "bilingual_simple",
  "bilingualLayout": "translated_first"
}'
request PUT "$BASE_URL/api/config" --data "$CFG_PAYLOAD" >/dev/null || fail "保存配置失败"

CFG_JSON="$(request GET "$BASE_URL/api/config")"
echo "$CFG_JSON" | grep -q '"subtitleFormat":"both"' || fail "subtitleFormat 未保存"
echo "$CFG_JSON" | grep -q '"subtitleStylePreset":"bilingual_simple"' || fail "subtitleStylePreset 未保存"
echo "$CFG_JSON" | grep -q '"bilingualLayout":"translated_first"' || fail "bilingualLayout 未保存"
log "配置读写通过"

log "4) 文件管理 API 基础检查"
mkdir -p /data/subx-smoke
TEST_PARENT="subx-smoke"
request POST "$BASE_URL/api/files/create-folder" --data "{\"parentPath\":\"$TEST_PARENT\",\"name\":\"demo-dir\"}" >/dev/null || true
request POST "$BASE_URL/api/files/rename" --data '{"path":"subx-smoke/demo-dir","newName":"demo-dir-renamed"}' >/dev/null || true
request POST "$BASE_URL/api/files/delete" --data '{"path":"subx-smoke/demo-dir-renamed"}' >/dev/null || true
log "文件管理接口已触发（若目录不存在会被安全拒绝）"

log "5) 任务创建参数透传检查（不等待完成）"
mkdir -p /data/subx-smoke
cat >/data/subx-smoke/sample.srt <<'SRT'
1
00:00:01,000 --> 00:00:02,000
Hello world
SRT

TASK_JSON="$(request POST "$BASE_URL/api/task" --data '{"filePath":"subx-smoke/sample.srt","sourceType":"external","trackIndex":0,"outputMode":"bilingual","subtitleFormat":"both","subtitleStylePreset":"bilingual_study","bilingualLayout":"original_first"}')"
TASK_ID="$(echo "$TASK_JSON" | sed -n 's/.*"taskId":"\([^"]*\)".*/\1/p')"
[[ -n "$TASK_ID" ]] || fail "创建任务失败: $TASK_JSON"
log "任务已创建: $TASK_ID"

sleep 1
TASK_DETAIL="$(request GET "$BASE_URL/api/tasks/$TASK_ID")"
echo "$TASK_DETAIL" | grep -q '"outputMode":"bilingual"' || fail "outputMode 参数未生效"
echo "$TASK_DETAIL" | grep -q '"subtitleFormat":"both"' || fail "subtitleFormat 参数未生效"
echo "$TASK_DETAIL" | grep -q '"subtitleStylePreset":"bilingual_study"' || fail "subtitleStylePreset 参数未生效"
echo "$TASK_DETAIL" | grep -q '"bilingualLayout":"original_first"' || fail "bilingualLayout 参数未生效"

log "PASS: 核心配置/参数链路检查通过"
log "提示: 该脚本不等待完整翻译完成；如需检查产物文件，请在任务完成后查看 /data/subx-smoke/ 目录。"
