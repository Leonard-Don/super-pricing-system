#!/bin/bash
# 启动前端服务

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
FRONTEND_HOST="${FRONTEND_HOST:-localhost}"
FRONTEND_PORT="${FRONTEND_PORT:-3100}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8100}"
REACT_APP_API_URL="${REACT_APP_API_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"

echo "正在启动前端服务..."

cd "$FRONTEND_DIR"

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖..."
    npm install
fi

# 启动开发服务器
echo "启动React开发服务器..."
PORT="$FRONTEND_PORT" BROWSER=none REACT_APP_API_URL="$REACT_APP_API_URL" npm start
