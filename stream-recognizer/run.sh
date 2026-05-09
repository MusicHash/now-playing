#!/usr/bin/env bash
# Starts stream-recognizer under screen on port HTTP_PORT (default 3847).
# Safe to run repeatedly — stops any existing session and starts fresh.

set -euo pipefail

SCREEN_NAME="stream-recognizer"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
LOG_FILE="$SCRIPT_DIR/log/stream.log"
ERROR_FILE="$SCRIPT_DIR/log/err.log"

# Resolve HTTP_PORT / HTTP_HOST from .env if available
PORT="$(grep -m1 '^HTTP_PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-3847}"
HTTP_HOST="$(grep -m1 '^HTTP_HOST=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
# Health check: use loopback unless bound to a specific non-any address
if [[ -z "$HTTP_HOST" || "$HTTP_HOST" == "0.0.0.0" || "$HTTP_HOST" == "::" ]]; then
    HEALTH_HOST="127.0.0.1"
else
    HEALTH_HOST="$HTTP_HOST"
fi

# ── helpers ──────────────────────────────────────────────────────────────────

green()  { printf '\e[32m%s\e[0m\n' "$*"; }
yellow() { printf '\e[33m%s\e[0m\n' "$*"; }
red()    { printf '\e[31m%s\e[0m\n' "$*"; }

# REDIS_URI from same .env — abort if Redis is down (before restarting screen)

redis_uri_from_env() {
    grep -m1 '^REDIS_URI=' "$ENV_FILE" 2>/dev/null | sed 's/^REDIS_URI=//' | sed 's/[[:space:]]*$//' | sed 's/^["'\'']//' | sed 's/["'\'']$//' | tr -d '\r'
}

parse_redis_host_port() {
    local uri="$1" r hp rest
    case "$uri" in
        redis://*) r="${uri#redis://}" ;;
        rediss://*) r="${uri#rediss://}" ;;
        *) return 1 ;;
    esac
    r="${r%%\?*}"
    [[ "$r" == *"@"* ]] && hp="${r#*@}" || hp="$r"
    hp="${hp%%/*}"
    REDIS_CHK_HOST="${hp%%:*}"
    rest="${hp#*:}"
    if [[ "$rest" == "$hp" ]]; then
        REDIS_CHK_PORT=6379
    else
        REDIS_CHK_PORT="$rest"
    fi
    return 0
}

redis_is_up() {
    local uri="$1"
    [[ -z "$uri" ]] && return 1
    REDIS_CHK_HOST=""
    REDIS_CHK_PORT=""
    parse_redis_host_port "$uri" || return 1
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -u "$uri" ping 2>/dev/null | grep -q PONG && return 0
    fi
    (echo >/dev/tcp/${REDIS_CHK_HOST}/${REDIS_CHK_PORT}) 2>/dev/null
}

if [[ ! -f "$ENV_FILE" ]]; then
    red "✗ Env file not found: $ENV_FILE"
    exit 1
fi
REDIS_URI_VAL="$(redis_uri_from_env)"
if [[ -z "$REDIS_URI_VAL" ]]; then
    red "✗ REDIS_URI is not set in $ENV_FILE"
    exit 1
fi
if ! redis_is_up "$REDIS_URI_VAL"; then
    parse_redis_host_port "$REDIS_URI_VAL" 2>/dev/null || true
    red "✗ Redis is not reachable from REDIS_URI (${REDIS_CHK_HOST:-?}:${REDIS_CHK_PORT:-?}) — start Redis first."
    yellow "  e.g. CONFIG=… $(cd "$SCRIPT_DIR/.." && pwd)/scripts/run_redis.sh"
    exit 1
fi

is_screen_running() {
    screen -list | grep -q "\.${SCREEN_NAME}[[:space:]]"
}

is_port_bound() {
    ss -tlnp "sport = :${PORT}" 2>/dev/null | grep -q ":${PORT}"
}

is_healthy() {
    curl -sf "http://${HEALTH_HOST}:${PORT}/health" -o /dev/null --max-time 3
}

# ── stop existing session (restart on re-run) ─────────────────────────────────

if is_screen_running; then
    yellow "⚠ Restarting stream-recognizer (stopping existing screen session)…"
    screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true
    sleep 1
fi

if is_port_bound; then
    red "✗ Port ${PORT} is in use by another process. Free it first:"
    ss -tlnp "sport = :${PORT}"
    exit 1
fi

# ── ensure log dir exists ─────────────────────────────────────────────────────

mkdir -p "$SCRIPT_DIR/log"

# ── launch ────────────────────────────────────────────────────────────────────

if [[ -n "$HTTP_HOST" ]]; then
    echo "Starting stream-recognizer (bind ${HTTP_HOST}:${PORT})…"
else
    echo "Starting stream-recognizer on port ${PORT}…"
fi
screen -dmS "$SCREEN_NAME" bash -c \
    "cd '$SCRIPT_DIR' && npm start 1>>'$LOG_FILE' 2>>'$ERROR_FILE'"

# ── wait for healthy ──────────────────────────────────────────────────────────

for i in $(seq 1 20); do
    sleep 1
    if is_healthy; then
        green "✓ stream-recognizer is up and healthy on ${HEALTH_HOST}:${PORT}"
        echo "  Screen session : $SCREEN_NAME   (screen -r $SCREEN_NAME)"
        echo "  Log            : $LOG_FILE"
        echo "  Errors         : $ERROR_FILE"
        exit 0
    fi
    printf '  Waiting… (%d/20)\r' "$i"
done

red "✗ App started but health check timed out after 20s."
echo "  Check the logs : $LOG_FILE"
echo "               : $ERROR_FILE"
echo "  Or attach    : screen -r $SCREEN_NAME"
exit 1
