#!/bin/sh
# Pull the SubX all-in-one image with resumable interruption and optional proxy.
#
# Docker already prints per-layer progress. Pressing Ctrl+C stops the pull;
# running the same command again resumes the already downloaded layers.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DEFAULT_VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$ROOT_DIR/package.json" 2>/dev/null | head -n 1)"
case "$DEFAULT_VERSION" in
  "") DEFAULT_VERSION="2.6.2" ;;
  v*) ;;
  *) DEFAULT_VERSION="v$DEFAULT_VERSION" ;;
esac
TAG="${SUBX_TAG:-$DEFAULT_VERSION}"
IMAGE="${SUBX_IMAGE:-ghcr.io/marod1m/subx:$TAG}"
MODE="image"
PROXY=""

usage() {
  cat <<'EOF'
用法：
  ./scripts/pull-image.sh [选项]

选项：
  --tag <tag>       指定镜像 tag，默认读取 package.json 版本
  --image <image>   直接指定完整镜像名
  --compose         使用 docker compose pull subx（读取当前 compose 文件）
  --proxy <url>     为本次拉取设置 HTTP/HTTPS/ALL_PROXY
  -h, --help        显示帮助

说明：
  - 下载进度由 Docker 原生输出，显示每个 layer 的下载量。
  - 按 Ctrl+C 中断后，重新执行同一命令即可续传（Docker 会复用已下载 layer）。
  - Docker Daemon 在 Linux 上需要单独配置代理，示例：
      /etc/systemd/system/docker.service.d/http-proxy.conf
      [Service]
      Environment="HTTP_PROXY=http://127.0.0.1:7890"
      Environment="HTTPS_PROXY=http://127.0.0.1:7890"
      Environment="NO_PROXY=localhost,127.0.0.1"
    然后执行 systemctl daemon-reload && systemctl restart docker
  - Docker Desktop 请在 Settings → Resources → Proxies 中配置。
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag)
      [ "$#" -ge 2 ] || { echo "缺少 --tag 参数" >&2; exit 2; }
      TAG="$2"
      case "$TAG" in
        v*) ;;
        *) TAG="v$TAG" ;;
      esac
      IMAGE="ghcr.io/marod1m/subx:$TAG"
      shift 2
      ;;
    --image)
      [ "$#" -ge 2 ] || { echo "缺少 --image 参数" >&2; exit 2; }
      IMAGE="$2"
      shift 2
      ;;
    --compose)
      MODE="compose"
      shift
      ;;
    --proxy)
      [ "$#" -ge 2 ] || { echo "缺少 --proxy 参数" >&2; exit 2; }
      PROXY="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker 命令" >&2
  exit 1
fi

if [ -n "$PROXY" ]; then
  export HTTP_PROXY="$PROXY"
  export HTTPS_PROXY="$PROXY"
  export ALL_PROXY="$PROXY"
  echo "已为本次命令设置代理：$PROXY"
  echo "注意：docker pull 由 Docker Daemon 执行，若拉取仍直连，请按 --help 提示配置 Daemon 代理。"
fi

echo "准备下载：$IMAGE"
echo "提示：按 Ctrl+C 可暂停；重新运行同一命令会从已下载的 layer 继续。"
echo

trap 'echo; echo "已暂停。Docker 会保留已下载的 layer，重新运行同一命令即可续传。"; exit 130' INT TERM

if [ "$MODE" = "compose" ]; then
  docker compose pull subx
else
  docker pull "$IMAGE"
fi

trap - INT TERM
echo
echo "镜像下载完成：$IMAGE"
echo "下一步：docker compose up -d"
