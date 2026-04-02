#!/usr/bin/env bash
# Starts ssl_proxy.js under screen on 127.0.0.1:9443 → 127.0.0.1:9393.
# Safe to run repeatedly — if it's already up and healthy, does nothing.
# Generates a self-signed TLS certificate on first run (via openssl).

set -euo pipefail

SCREEN_NAME="ssl_proxy"
HTTPS_PORT=9443
HTTP_PORT=9393
HOST="127.0.0.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_SCRIPT="$SCRIPT_DIR/ssl_proxy.js"
CERTS_DIR="$SCRIPT_DIR/certs"
LOG_FILE="/tmp/${SCREEN_NAME}.log"

# ── helpers ───────────────────────────────────────────────────────────────────

green()  { printf '\e[32m%s\e[0m\n' "$*"; }
yellow() { printf '\e[33m%s\e[0m\n' "$*"; }
red()    { printf '\e[31m%s\e[0m\n' "$*"; }

is_screen_running() {
    screen -list | grep -q "\.${SCREEN_NAME}[[:space:]]"
}

is_port_bound() {
    ss -tlnp "sport = :${HTTPS_PORT}" 2>/dev/null | grep -q ":${HTTPS_PORT}"
}

is_healthy() {
    # -k: accept self-signed cert
    curl -sf -k "https://${HOST}:${HTTPS_PORT}/api/health" -o /dev/null --max-time 3
}

# ── already up? ───────────────────────────────────────────────────────────────

if is_screen_running && is_healthy; then
    green "✓ ssl_proxy is already running and healthy on ${HOST}:${HTTPS_PORT}"
    exit 0
fi

# ── stale screen / zombie? ────────────────────────────────────────────────────

if is_screen_running; then
    yellow "⚠ Screen session exists but health check failed — restarting…"
    screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true
    sleep 1
fi

if is_port_bound; then
    red "✗ Port ${HTTPS_PORT} is in use by another process. Free it first:"
    ss -tlnp "sport = :${HTTPS_PORT}"
    exit 1
fi

# ── generate self-signed certificate (once) ───────────────────────────────────

mkdir -p "$CERTS_DIR"

if [[ ! -f "$CERTS_DIR/server.key" || ! -f "$CERTS_DIR/server.crt" ]]; then
    yellow "Generating self-signed TLS certificate…"

    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$CERTS_DIR/server.key" \
        -out    "$CERTS_DIR/server.crt" \
        -days   825 \
        -subj   "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
        2>/dev/null

    green "✓ Certificate written to $CERTS_DIR/"
    echo ""
    echo "  To trust it in your browser (one-time, avoids the cert warning):"
    echo ""
    echo "  Linux / Chrome:"
    echo "    certutil -d sql:\$HOME/.pki/nssdb -A -t 'CT,,' \\"
    echo "      -n localhost-ssl-proxy -i $CERTS_DIR/server.crt"
    echo ""
    echo "  Windows (run from PowerShell as Admin):"
    echo "    Import-Certificate -FilePath '$CERTS_DIR/server.crt' \\"
    echo "      -CertStoreLocation Cert:\\LocalMachine\\Root"
    echo ""
fi

# ── launch ────────────────────────────────────────────────────────────────────

echo "Starting ssl_proxy on ${HOST}:${HTTPS_PORT}…"
screen -dmS "$SCREEN_NAME" bash -c \
    "HTTPS_PORT=${HTTPS_PORT} HTTP_PORT=${HTTP_PORT} \
     node --experimental-specifier-resolution=node \
     '$PROXY_SCRIPT' 2>&1 | tee '$LOG_FILE'"

# ── wait for healthy ──────────────────────────────────────────────────────────

for i in $(seq 1 15); do
    sleep 1
    if is_healthy; then
        green "✓ ssl_proxy is up and healthy on ${HOST}:${HTTPS_PORT}"
        echo "  Forwarding     : https://${HOST}:${HTTPS_PORT} → http://${HOST}:${HTTP_PORT}"
        echo "  Screen session : $SCREEN_NAME   (screen -r $SCREEN_NAME)"
        echo "  Log            : $LOG_FILE"
        exit 0
    fi
    printf '  Waiting… (%d/15)\r' "$i"
done

red "✗ Proxy started but health check timed out after 15s."
echo "  Check the log : $LOG_FILE"
echo "  Or attach     : screen -r $SCREEN_NAME"
exit 1
