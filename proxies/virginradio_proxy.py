#!/usr/bin/env python3
"""
HTTP proxy that fetches Virgin Radio station data through a headless browser
to bypass Cloudflare/bot protection. Requires xvfb and nodriver.

Usage:
    xvfb-run python3 virginradio_proxy.py [--port PORT]
    screen -dmS virginradio_proxy xvfb-run python3 virginradio_proxy.py [--port PORT]

Dependencies:
    pip install nodriver aiohttp
"""

import argparse
import asyncio
import logging
import time

import nodriver as uc
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TARGET_URL = (
    "https://virginradio.co.uk/api/get-station-data"
    "?station=virginradiouk&withSongs=1&hasPrograms=1&numberOfSongs=20"
)

CACHE_TTL_SECONDS = 15
_cache = {"content": None, "fetched_at": 0}
_fetch_lock = asyncio.Lock()


CHROME_BINARY = "~/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome"  # e.g. "/usr/bin/chromium" to override auto-detection


async def fetch_via_browser():
    log.info("Launching headless browser for %s", TARGET_URL)
    kwargs = {}
    if CHROME_BINARY:
        kwargs["browser_executable_path"] = CHROME_BINARY
    browser = await uc.start(**kwargs)
    try:
        page = await browser.get(TARGET_URL)
        await page.sleep(3)
        content = await page.get_content()
        return content
    finally:
        browser.stop()


async def get_cached_content():
    now = time.monotonic()
    if _cache["content"] and (now - _cache["fetched_at"]) < CACHE_TTL_SECONDS:
        return _cache["content"]

    async with _fetch_lock:
        now = time.monotonic()
        if _cache["content"] and (now - _cache["fetched_at"]) < CACHE_TTL_SECONDS:
            return _cache["content"]

        content = await fetch_via_browser()
        _cache["content"] = content
        _cache["fetched_at"] = time.monotonic()
        return content


async def handle_request(request):
    try:
        content = await get_cached_content()
        return web.Response(text=content, content_type="text/html")
    except Exception:
        log.exception("Failed to fetch Virgin Radio data")
        return web.Response(text="Error fetching data", status=502)


async def handle_health(request):
    return web.Response(text="ok")


def main():
    parser = argparse.ArgumentParser(description="Virgin Radio API proxy")
    parser.add_argument("--port", type=int, default=8790, help="Port to listen on (default: 8790)")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to (default: 0.0.0.0)")
    args = parser.parse_args()

    app = web.Application()
    app.router.add_get("/", handle_request)
    app.router.add_get("/health", handle_health)

    log.info("Starting proxy on %s:%d", args.host, args.port)
    web.run_app(app, host=args.host, port=args.port, print=lambda msg: log.info(msg))


if __name__ == "__main__":
    main()
