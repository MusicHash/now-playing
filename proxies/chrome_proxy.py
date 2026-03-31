#!/usr/bin/env python3
"""
Headless-browser HTTP proxy.  Fetches any URL through a real Chrome instance
to bypass Cloudflare / JS-challenge bot protection.

Usage:
    xvfb-run python3 chrome_proxy.py [--port PORT] [--host HOST]
    screen -dmS chrome_proxy xvfb-run python3 chrome_proxy.py

Request format:
    GET /?url=https://example.com/api/endpoint?foo=bar&baz=1
    GET /health

Dependencies:
    pip install nodriver aiohttp
"""

import argparse
import asyncio
import logging
import os
import time
from urllib.parse import unquote, urlparse

import nodriver as uc
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

CHROME_BINARY = os.path.expanduser("~/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome")
CACHE_TTL_SECONDS = 15
PAGE_SETTLE_SECONDS = 3

# Per-URL cache: { url -> {"content": str, "fetched_at": float} }
_cache: dict[str, dict] = {}
# Per-URL locks to prevent parallel fetches for the same URL
_locks: dict[str, asyncio.Lock] = {}
_locks_mutex = asyncio.Lock()


async def _get_lock(url: str) -> asyncio.Lock:
    async with _locks_mutex:
        if url not in _locks:
            _locks[url] = asyncio.Lock()
        return _locks[url]


async def fetch_via_browser(url: str) -> str:
    log.info("Launching headless browser for %s", url)
    kwargs = {}
    if CHROME_BINARY and os.path.isfile(CHROME_BINARY):
        kwargs["browser_executable_path"] = CHROME_BINARY
    browser = await uc.start(**kwargs)
    try:
        page = await browser.get(url)
        await page.sleep(PAGE_SETTLE_SECONDS)
        return await page.get_content()
    finally:
        browser.stop()


async def get_cached(url: str) -> str:
    now = time.monotonic()
    entry = _cache.get(url)
    if entry and (now - entry["fetched_at"]) < CACHE_TTL_SECONDS:
        return entry["content"]

    lock = await _get_lock(url)
    async with lock:
        now = time.monotonic()
        entry = _cache.get(url)
        if entry and (now - entry["fetched_at"]) < CACHE_TTL_SECONDS:
            return entry["content"]

        content = await fetch_via_browser(url)
        _cache[url] = {"content": content, "fetched_at": time.monotonic()}
        return content


def validate_url(raw: str) -> str | None:
    """Return the URL if valid http/https, otherwise None."""
    try:
        parsed = urlparse(unquote(raw))
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return parsed.geturl()
    except Exception:
        pass
    return None


async def handle_request(request: web.Request) -> web.Response:
    raw_url = request.rel_url.query.get("url", "").strip()
    if not raw_url:
        return web.Response(
            text='Missing required query parameter: ?url=https://...', status=400
        )

    url = validate_url(raw_url)
    if not url:
        return web.Response(
            text=f"Invalid URL: must be http or https with a hostname.", status=400
        )

    try:
        content = await get_cached(url)
        return web.Response(text=content, content_type="text/html")
    except Exception:
        log.exception("Failed to fetch %s", url)
        return web.Response(text=f"Error fetching {url}", status=502)


async def handle_health(request: web.Request) -> web.Response:
    return web.Response(text="ok")


def main() -> None:
    parser = argparse.ArgumentParser(description="Headless-browser HTTP proxy")
    parser.add_argument("--port", type=int, default=50015, help="Port to listen on (default: 50015)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    args = parser.parse_args()

    app = web.Application()
    app.router.add_get("/", handle_request)
    app.router.add_get("/health", handle_health)

    log.info("Starting proxy on %s:%d", args.host, args.port)
    web.run_app(app, host=args.host, port=args.port, print=lambda msg: log.info(msg))


if __name__ == "__main__":
    main()
