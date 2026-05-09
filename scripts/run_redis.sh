#!/usr/bin/env bash
# Starts Redis from CONFIG. If the configured TCP port is already ours (PING ok,
# or ss shows redis-server / valkey-server), shuts down gracefully and starts fresh.
# Loads requirepass into REDISCLI_AUTH so redis-cli works when auth is enabled.
# If the port is taken by something else, exits with an error (same idea as other run.sh scripts).

set -euo pipefail

CONFIG="${CONFIG:-~/_REDIS/redis.conf}"
REDIS_SERVER="${REDIS_SERVER:-/opt/local/sbin/redis/bin/redis-server}"
REDIS_CLI="${REDIS_CLI:-$(dirname "$REDIS_SERVER")/redis-cli}"
# Optional: set when Redis bind is not reachable via redis-cli default (127.0.0.1), e.g. REDIS_CLI_HOST=10.0.0.1

# ── helpers ──────────────────────────────────────────────────────────────────

green()  { printf '\e[32m%s\e[0m\n' "$*"; }
yellow() { printf '\e[33m%s\e[0m\n' "$*"; }
red()    { printf '\e[31m%s\e[0m\n' "$*"; }

redis_port_from_config() {
    local p=""
    if [[ -f "$CONFIG" ]]; then
        p="$(grep -m1 '^[[:space:]]*port[[:space:]]' "$CONFIG" | awk '{print $2}' | tr -d '[:space:]')"
    fi
    echo "${p:-6379}"
}

requirepass_from_config() {
    local line pw
    line="$(grep -m1 '^[[:space:]]*requirepass[[:space:]]' "$CONFIG" 2>/dev/null || true)"
    [[ -z "$line" ]] && return 0
    pw="$(echo "$line" | awk '{print $2}')"
    pw="${pw#\"}"
    pw="${pw%\"}"
    pw="${pw#\'}"
    pw="${pw%\'}"
    printf '%s' "$pw"
}

apply_redis_cli_auth() {
    local pw
    pw="$(requirepass_from_config)"
    if [[ -n "$pw" ]]; then
        export REDISCLI_AUTH="$pw"
    fi
}

is_port_bound() {
    ss -tlnp "sport = :${PORT}" 2>/dev/null | grep -q ":${PORT}"
}

is_redis_listener() {
    ss -tlnp "sport = :${PORT}" 2>/dev/null | grep -qiE 'redis-server|valkey-server'
}

# ── config / binaries ─────────────────────────────────────────────────────────

if [[ ! -f "$CONFIG" ]]; then
    red "✗ Redis config not found: $CONFIG"
    exit 1
fi

PORT="$(redis_port_from_config)"

if [[ ! -x "$REDIS_SERVER" ]]; then
    red "✗ redis-server not executable: $REDIS_SERVER"
    exit 1
fi

if [[ ! -x "$REDIS_CLI" ]]; then
    red "✗ redis-cli not executable: $REDIS_CLI (set REDIS_CLI or fix REDIS_SERVER path)"
    exit 1
fi

apply_redis_cli_auth

declare -a REDIS_CLI_CONN=( -p "$PORT" )
if [[ -n "${REDIS_CLI_HOST:-}" ]]; then
    REDIS_CLI_CONN=( -h "$REDIS_CLI_HOST" -p "$PORT" )
fi

redis_ping() {
    "$REDIS_CLI" "${REDIS_CLI_CONN[@]}" ping 2>/dev/null | grep -q PONG
}

redis_shutdown() {
    "$REDIS_CLI" "${REDIS_CLI_CONN[@]}" shutdown 2>/dev/null || true
}

# ── port logic: restart Redis vs alien listener ───────────────────────────────

if is_port_bound; then
    if redis_ping || is_redis_listener; then
        yellow "⚠ Port ${PORT} is Redis — restarting (SHUTDOWN)…"
        redis_shutdown
        for _ in $(seq 1 40); do
            if ! is_port_bound; then break; fi
            sleep 0.25
        done
        if is_port_bound; then
            red "✗ Port ${PORT} still in use after SHUTDOWN:"
            ss -tlnp "sport = :${PORT}"
            exit 1
        fi
    else
        red "✗ Port ${PORT} is in use by another process (not Redis / no PING). Free it first:"
        ss -tlnp "sport = :${PORT}"
        exit 1
    fi
fi

# ── launch ───────────────────────────────────────────────────────────────────

echo "Starting Redis (config ${CONFIG}, port ${PORT})…"
"$REDIS_SERVER" "$CONFIG" --daemonize yes

# ── wait for PONG ─────────────────────────────────────────────────────────────

for i in $(seq 1 20); do
    sleep 1
    if redis_ping; then
        green "✓ Redis is up on port ${PORT}"
        echo "  Config : $CONFIG"
        echo "  Bin    : $REDIS_SERVER"
        exit 0
    fi
    printf '  Waiting… (%d/20)\r' "$i"
done

red "✗ Redis did not respond to PING within 20s."
exit 1
