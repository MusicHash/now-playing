#!/usr/bin/env bash
# Starts the now-playing app under screen on port HTTP_PORT (default 9393).
# Safe to run repeatedly — if it's already up and healthy, does nothing.

set -euo pipefail

SCREEN_NAME="now-playing"
HOST="127.0.0.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
LOG_FILE="$SCRIPT_DIR/log/stream.log"
ERROR_FILE="$SCRIPT_DIR/log/err.log"

# Resolve HTTP_PORT from .env if available, fall back to 9393
PORT="$(grep -m1 '^HTTP_PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-9393}"

# ── helpers ──────────────────────────────────────────────────────────────────

green()  { printf '\e[32m%s\e[0m\n' "$*"; }
yellow() { printf '\e[33m%s\e[0m\n' "$*"; }
red()    { printf '\e[31m%s\e[0m\n' "$*"; }

is_screen_running() {
    screen -list | grep -q "\.${SCREEN_NAME}[[:space:]]"
}

is_port_bound() {
    ss -tlnp "sport = :${PORT}" 2>/dev/null | grep -q ":${PORT}"
}

is_healthy() {
    curl -sf "http://${HOST}:${PORT}/actions" -o /dev/null --max-time 3
}

# ── already up? ───────────────────────────────────────────────────────────────

if is_screen_running && is_healthy; then
    green "✓ now-playing is already running and healthy on ${HOST}:${PORT}"
    exit 0
fi

# ── stale screen / zombie? ────────────────────────────────────────────────────

if is_screen_running; then
    yellow "⚠ Screen session exists but health check failed — restarting…"
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

echo "Starting now-playing on ${HOST}:${PORT}…"
screen -dmS "$SCREEN_NAME" bash -c \
    "cd '$SCRIPT_DIR' && npm start 1>>'$LOG_FILE' 2>>'$ERROR_FILE'"

# ── wait for healthy ──────────────────────────────────────────────────────────

for i in $(seq 1 20); do
    sleep 1
    if is_healthy; then
        green "✓ now-playing is up and healthy on ${HOST}:${PORT}"
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
