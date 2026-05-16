#!/usr/bin/env bash

# Start Celery beat for alt-data refresh tasks.
#
# Mirrors the pattern of scripts/start_celery_worker.sh: sources
# logs/infra-stack.env when present so the broker URL is auto-populated,
# verifies Celery is installed, and execs `celery beat` in the foreground
# under a managed pid file so launchd / systemd / a parent shell can supervise
# the process.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
PID_FILE="$LOG_DIR/celery-beat.pid"
SCHEDULE_FILE="$LOG_DIR/celery-beat-schedule"
LOG_FILE="$LOG_DIR/celery-beat.log"
INFRA_ENV_FILE="$LOG_DIR/infra-stack.env"

LOG_LEVEL="${CELERY_BEAT_LOGLEVEL:-info}"
USE_INFRA_ENV=1
FOREGROUND=0

usage() {
    cat <<'EOF'
用法: ./scripts/start_alt_data_beat.sh [--no-infra-env] [--loglevel LEVEL] [--foreground] [--help]

选项:
  --no-infra-env     不自动读取 logs/infra-stack.env
  --loglevel LEVEL   Celery beat 日志级别，默认 info
  --foreground       前台运行（适合 launchd / systemd / docker entrypoint）；
                     默认后台运行并写入 logs/celery-beat.{pid,log}
  --help             显示帮助
EOF
}

log_info() {
    echo "$1"
}

log_error() {
    echo "$1" >&2
}

process_alive() {
    local pid="$1"
    kill -0 "$pid" >/dev/null 2>&1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-infra-env)
            USE_INFRA_ENV=0
            ;;
        --loglevel)
            LOG_LEVEL="${2:-info}"
            shift
            ;;
        --foreground)
            FOREGROUND=1
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            log_error "❌ 未知参数: $1"
            usage
            exit 1
            ;;
    esac
    shift
done

mkdir -p "$LOG_DIR"

if [[ "$USE_INFRA_ENV" -eq 1 && -f "$INFRA_ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$INFRA_ENV_FILE"
    export DATABASE_URL REDIS_URL CELERY_BROKER_URL CELERY_RESULT_BACKEND
fi

# Make sure alt-data refresh routes through Celery beat (not the in-process
# APScheduler) when the backend is brought up alongside this process.
export ALT_DATA_USE_CELERY_BEAT="${ALT_DATA_USE_CELERY_BEAT:-1}"

if [[ -z "${CELERY_BROKER_URL:-}" ]]; then
    log_error "❌ 未配置 CELERY_BROKER_URL。可先运行 ./scripts/start_infra_stack.sh 或导出 broker 环境变量。"
    exit 1
fi

if ! python3 - <<'PY' >/dev/null 2>&1
import celery  # noqa: F401
PY
then
    log_error "❌ 当前 Python 环境未安装 celery。请先运行 ./scripts/start_system.sh --install"
    exit 1
fi

if [[ -f "$PID_FILE" ]]; then
    EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$EXISTING_PID" ]] && process_alive "$EXISTING_PID"; then
        log_info "✅ Celery beat 已在运行 (PID: $EXISTING_PID)"
        log_info "   - 日志文件: $LOG_FILE"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

log_info "⏰ 启动 Celery beat..."
log_info "   - Broker: ${CELERY_BROKER_URL}"
log_info "   - Loglevel: ${LOG_LEVEL}"
log_info "   - Schedule file: ${SCHEDULE_FILE}"

if [[ "$FOREGROUND" -eq 1 ]]; then
    cd "$PROJECT_ROOT"
    exec env PYTHONPATH="$PROJECT_ROOT:${PYTHONPATH:-}" \
        python3 -m celery -A backend.app.core.task_queue:celery_app beat \
        --loglevel="$LOG_LEVEL" \
        --schedule="$SCHEDULE_FILE"
fi

(
    cd "$PROJECT_ROOT"
    PYTHONPATH="$PROJECT_ROOT:${PYTHONPATH:-}" \
    nohup python3 -m celery -A backend.app.core.task_queue:celery_app beat \
        --loglevel="$LOG_LEVEL" \
        --schedule="$SCHEDULE_FILE" \
        >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
)

sleep 3
BEAT_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -z "$BEAT_PID" ]] || ! process_alive "$BEAT_PID"; then
    log_error "❌ Celery beat 启动失败，请查看日志: $LOG_FILE"
    exit 1
fi

log_info "✅ Celery beat 已启动 (PID: $BEAT_PID)"
log_info "   - 日志文件: $LOG_FILE"
log_info "   - 停止命令: ./scripts/stop_alt_data_beat.sh"
