#!/usr/bin/env bash
# Starts chrome_proxy.py under screen on 127.0.0.1:50015.
# Safe to run repeatedly — if it's already up and healthy, does nothing.

set -euo pipefail

SCREEN_NAME="chrome_proxy"
PORT=50015
HOST="127.0.0.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_SCRIPT="$SCRIPT_DIR/chrome_proxy.py"
VENV_PYTHON="$SCRIPT_DIR/../.venv/bin/python3"
LOG_FILE="/tmp/${SCREEN_NAME}.log"

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
    curl -sf "http://${HOST}:${PORT}/health" -o /dev/null --max-time 3
}

# ── already up? ──────────────────────────────────────────────────────────────

if is_screen_running && is_healthy; then
    green "✓ chrome_proxy is already running and healthy on ${HOST}:${PORT}"
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

# ── python binary ─────────────────────────────────────────────────────────────

if [[ ! -x "$VENV_PYTHON" ]]; then
    # fall back to activated venv or system python3
    VENV_PYTHON="$(command -v python3)"
fi

# ── launch ────────────────────────────────────────────────────────────────────

echo "Starting chrome_proxy on ${HOST}:${PORT}…"
screen -dmS "$SCREEN_NAME" bash -c \
    "xvfb-run $VENV_PYTHON $PROXY_SCRIPT --host $HOST --port $PORT 2>&1 | tee $LOG_FILE"

# ── wait for healthy ──────────────────────────────────────────────────────────

for i in $(seq 1 15); do
    sleep 1
    if is_healthy; then
        green "✓ chrome_proxy is up and healthy on ${HOST}:${PORT}"
        echo "  Screen session : $SCREEN_NAME   (screen -r $SCREEN_NAME)"
        echo "  Log            : $LOG_FILE"
        exit 0
    fi
    printf '  Waiting… (%d/15)\r' "$i"
done

red "✗ Proxy started but health check timed out after 15s."
echo "  Check the log: $LOG_FILE"
echo "  Or attach:     screen -r $SCREEN_NAME"
exit 1
