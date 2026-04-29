#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"
BACKEND_PORT="${BACKEND_PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-3100}"
WITH_INFRA=0
REMOVE_INFRA_VOLUMES=0
WITH_WORKER=0

usage() {
    cat <<'EOF'
用法: ./scripts/stop_system.sh [--with-infra] [--with-worker] [--remove-infra-volumes] [--help]

选项:
  --with-infra           停止前后端后，同时停止本地 TimescaleDB + Redis 容器
  --with-worker          停止本地 Celery worker
  --remove-infra-volumes 与 --with-infra 搭配使用，额外删除容器数据卷
  --help                 显示帮助
EOF
}

process_alive() {
    local pid="$1"
    kill -0 "$pid" >/dev/null 2>&1
}

is_positive_pid() {
    local pid="$1"
    [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 ]]
}

process_command() {
    local pid="$1"
    ps -p "$pid" -o command= 2>/dev/null || true
}

process_cwd() {
    local pid="$1"
    if ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk 'BEGIN { FS="n" } /^n/ { print $2; exit }'
}

is_project_managed_process() {
    local pid="$1"
    local command
    local cwd
    is_positive_pid "$pid" || return 1
    command="$(process_command "$pid")"
    cwd="$(process_cwd "$pid")"
    [[ -n "$command" && ( "$command" == *"$PROJECT_ROOT/"* || "$command" == *"$FRONTEND_DIR/"* ) ]] || \
        [[ -n "$cwd" && ( "$cwd" == "$PROJECT_ROOT" || "$cwd" == "$FRONTEND_DIR" ) ]]
}

collect_pid_tree() {
    local pid="$1"
    local children=""
    is_positive_pid "$pid" || return 0

    echo "$pid"
    if command -v pgrep >/dev/null 2>&1; then
        children="$(pgrep -P "$pid" 2>/dev/null || true)"
        while IFS= read -r child; do
            [[ -n "$child" ]] || continue
            collect_pid_tree "$child"
        done <<< "$children"
    fi
}

signal_pid_tree() {
    local root_pid="$1"
    local signal="$2"
    local tracked_pids="$3"

    if is_positive_pid "$root_pid"; then
        kill -s "$signal" "-$root_pid" >/dev/null 2>&1 || true
    fi

    while IFS= read -r pid; do
        is_positive_pid "$pid" || continue
        [[ "$pid" != "$$" ]] || continue
        kill -s "$signal" "$pid" >/dev/null 2>&1 || true
    done <<< "$tracked_pids"
}

any_tracked_pid_alive() {
    local tracked_pids="$1"

    while IFS= read -r pid; do
        is_positive_pid "$pid" || continue
        if process_alive "$pid"; then
            return 0
        fi
    done <<< "$tracked_pids"

    return 1
}

graceful_stop_pid() {
    local pid="$1"
    local label="$2"
    local tracked_pids

    if ! is_positive_pid "$pid"; then
        return 0
    fi
    if ! process_alive "$pid"; then
        echo "⚠️  $label 已经停止"
        return 0
    fi

    tracked_pids="$(collect_pid_tree "$pid" | awk '!seen[$0]++')"
    signal_pid_tree "$pid" TERM "$tracked_pids"
    for _ in $(seq 1 10); do
        if ! any_tracked_pid_alive "$tracked_pids"; then
            echo "✅ $label 已停止 (PID: $pid)"
            return 0
        fi
        sleep 1
    done

    echo "⚠️  $label 未及时退出，执行强制停止..."
    signal_pid_tree "$pid" KILL "$tracked_pids"
    echo "✅ $label 已强制停止 (PID: $pid)"
}

stop_from_pid_file() {
    local pid_file="$1"
    local label="$2"

    if [[ ! -f "$pid_file" ]]; then
        return 0
    fi

    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
        graceful_stop_pid "$pid" "$label"
    fi
    rm -f "$pid_file"
}

stop_project_listeners_on_port() {
    local port="$1"
    local label="$2"
    local pids=""

    if ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi

    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        if is_project_managed_process "$pid"; then
            graceful_stop_pid "$pid" "$label"
        fi
    done <<< "$pids"
}

assert_project_port_released() {
    local port="$1"
    local label="$2"
    local pids=""
    local remaining_project_pids=""

    if ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi

    stop_project_listeners_on_port "$port" "$label"
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        if is_project_managed_process "$pid"; then
            remaining_project_pids+="${pid} "
        fi
    done <<< "$pids"

    if [[ -n "$remaining_project_pids" ]]; then
        echo "❌ $label 仍有本项目监听进程占用端口 $port: $remaining_project_pids" >&2
        return 1
    fi

    if [[ -n "$pids" ]]; then
        echo "ℹ️  端口 $port 仍被非本项目进程占用，未自动清理: $pids"
    fi
}

stop_project_processes_matching() {
    local pattern="$1"
    local label="$2"
    local pids=""

    if ! command -v pgrep >/dev/null 2>&1; then
        return 0
    fi

    pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
    while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        if is_project_managed_process "$pid"; then
            graceful_stop_pid "$pid" "$label"
        fi
    done <<< "$pids"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --with-infra)
            WITH_INFRA=1
            ;;
        --with-worker)
            WITH_WORKER=1
            ;;
        --remove-infra-volumes)
            REMOVE_INFRA_VOLUMES=1
            WITH_INFRA=1
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "❌ 未知参数: $1" >&2
            usage
            exit 1
            ;;
    esac
    shift
done

echo "🛑 正在停止超级定价系统..."

mkdir -p "$LOG_DIR"
stop_from_pid_file "$BACKEND_PID_FILE" "后端服务"
stop_from_pid_file "$FRONTEND_PID_FILE" "前端服务"
stop_project_listeners_on_port "$BACKEND_PORT" "后端服务"
stop_project_listeners_on_port "$FRONTEND_PORT" "前端服务"
stop_project_processes_matching "$PROJECT_ROOT/scripts/start_backend.py" "后端服务"
stop_project_processes_matching "uvicorn.*backend.main:app" "后端服务"
stop_project_processes_matching "react-scripts start" "前端服务"
stop_project_processes_matching "node.*react-scripts" "前端服务"
stop_project_processes_matching "$PROJECT_ROOT/frontend/node_modules/.bin/react-scripts" "前端服务"
assert_project_port_released "$BACKEND_PORT" "后端服务"
assert_project_port_released "$FRONTEND_PORT" "前端服务"

if [[ "$WITH_WORKER" -eq 1 ]]; then
    "$PROJECT_ROOT/scripts/stop_celery_worker.sh"
fi

if [[ "$WITH_INFRA" -eq 1 ]]; then
    if [[ "$REMOVE_INFRA_VOLUMES" -eq 1 ]]; then
        "$PROJECT_ROOT/scripts/stop_infra_stack.sh" --remove-volumes
    else
        "$PROJECT_ROOT/scripts/stop_infra_stack.sh"
    fi
fi

echo "🏁 系统相关进程已完全停止"
