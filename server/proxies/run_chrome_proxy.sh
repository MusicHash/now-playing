#!/usr/bin/env bash
# Starts chrome_proxy.py under screen on 127.0.0.1:50015.
# Safe to run repeatedly — stops any existing session and starts fresh.

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

# ── stop existing session (restart on re-run) ─────────────────────────────────

if is_screen_running; then
    yellow "⚠ Restarting chrome_proxy (stopping existing screen session)…"
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
# With a real display (e.g. WSLg sets DISPLAY=:0), xvfb is unnecessary and often
# breaks here (_XSERVTransSocketCreateListener) if /tmp/.X11-unix is not mode 1777.
# Headless: xvfb-run -a picks a free server number (not needed for cloudscraper).

BACKEND_ARGS=()
if [[ -n "${CHROME_PROXY_FETCH_BACKEND:-}" ]]; then
    BACKEND_ARGS=( --fetch-backend "$CHROME_PROXY_FETCH_BACKEND" )
fi

USE_CHROME=1
if [[ "${CHROME_PROXY_FETCH_BACKEND:-}" == "cloudscraper" ]]; then
    USE_CHROME=0
fi

if [[ "$USE_CHROME" -eq 1 && -n "${DISPLAY:-}" ]]; then
    PROXY_EXEC=( "$VENV_PYTHON" "$PROXY_SCRIPT" --host "$HOST" --port "$PORT" "${BACKEND_ARGS[@]}" )
    echo "Starting chrome_proxy on ${HOST}:${PORT} (DISPLAY=${DISPLAY})…"
elif [[ "$USE_CHROME" -eq 1 ]]; then
    PROXY_EXEC=( xvfb-run -a "$VENV_PYTHON" "$PROXY_SCRIPT" --host "$HOST" --port "$PORT" "${BACKEND_ARGS[@]}" )
    echo "Starting chrome_proxy on ${HOST}:${PORT} (xvfb-run -a)…"
else
    PROXY_EXEC=( "$VENV_PYTHON" "$PROXY_SCRIPT" --host "$HOST" --port "$PORT" "${BACKEND_ARGS[@]}" )
    echo "Starting chrome_proxy (cloudscraper) on ${HOST}:${PORT}…"
fi

cmd_q=$(printf '%q ' "${PROXY_EXEC[@]}")
log_q=$(printf '%q' "$LOG_FILE")
screen -dmS "$SCREEN_NAME" bash -c "${cmd_q} 2>&1 | tee ${log_q}"

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
