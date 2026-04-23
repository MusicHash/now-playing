#!/usr/bin/env python3
"""
Headless-browser HTTP proxy.  Fetches any URL through a real Chrome instance
to bypass Cloudflare / JS-challenge bot protection.

Usage:
    python3 chrome_proxy.py [--port PORT] [--host HOST]    # when DISPLAY is set (desktop / WSLg)
    xvfb-run -a python3 chrome_proxy.py                    # headless; -a avoids busy :99
    ./run_chrome_proxy.sh                                   # picks xvfb vs display automatically

Request format:
    GET /?url=https://example.com/api/endpoint?foo=bar&baz=1
    GET /health

Dependencies:
    pip install nodriver aiohttp

Environment:
    CHROME_PROXY_USER_DATA_DIR — Chrome profile dir (default: ~/.cache/now-playing/chrome-proxy-profile).
    CHROME_PROXY_CF_MAX_WAIT — Seconds to wait for Cloudflare challenge (default: 45).
    CHROME_PROXY_SERVER — Upstream proxy for Chrome (outbound IP / geo). Examples:
        http://proxy.example.com:8080  |  socks5://127.0.0.1:1080  |  http://user:pass@host:3128
    CHROME_PROXY_BYPASS_LIST — Optional; Chrome --proxy-bypass-list (e.g. <-loopback> to skip proxy for localhost).
"""

import importlib.util
import pathlib
import sys


def _patch_nodriver_network_py_if_needed() -> None:
    """nodriver<=0.48.1 ships cdp/network.py with Latin-1 ± (0xB1) in a comment.

    Python 3.14+ treats source as UTF-8 and raises SyntaxError on import.
    Rewrite that sequence to ASCII before importing nodriver.
    """
    try:
        spec = importlib.util.find_spec("nodriver")
    except (ImportError, ValueError):
        return
    if not spec or not spec.submodule_search_locations:
        return
    root = pathlib.Path(next(iter(spec.submodule_search_locations)))
    network_py = root / "cdp" / "network.py"
    if not network_py.is_file():
        return
    data = network_py.read_bytes()
    bad, good = b"(\xb1Inf)", b"(+/-Inf)"
    if bad not in data:
        return
    network_py.write_bytes(data.replace(bad, good, 1))
    pycache = network_py.parent / "__pycache__"
    if pycache.is_dir():
        for p in pycache.glob("network.*.pyc"):
            try:
                p.unlink()
            except OSError:
                pass


_patch_nodriver_network_py_if_needed()

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
# Persistent profile keeps cf_clearance and other cookies across proxy restarts (env override).
_DEFAULT_PROFILE = os.path.join(
    os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")),
    "now-playing",
    "chrome-proxy-profile",
)
CHROME_PROXY_USER_DATA_DIR = os.environ.get("CHROME_PROXY_USER_DATA_DIR", _DEFAULT_PROFILE)
CHROME_PROXY_CF_MAX_WAIT = float(os.environ.get("CHROME_PROXY_CF_MAX_WAIT", "45"))
CHROME_PROXY_SERVER = os.environ.get("CHROME_PROXY_SERVER", "").strip()
CHROME_PROXY_BYPASS_LIST = os.environ.get("CHROME_PROXY_BYPASS_LIST", "").strip()

CACHE_TTL_SECONDS = 15
PAGE_SETTLE_SECONDS = 2

# Per-URL cache: { url -> {"content": str, "fetched_at": float} }
_cache: dict[str, dict] = {}
# Per-URL locks to prevent parallel fetches for the same URL
_locks: dict[str, asyncio.Lock] = {}
_locks_mutex = asyncio.Lock()

# Single persistent Chrome instance shared across all requests
_browser: uc.Browser | None = None
_browser_lock = asyncio.Lock()


class CloudflareChallengeTimeout(Exception):
    """Page still looks like a Cloudflare interstitial after max wait."""


async def _page_looks_like_cf_challenge(page: uc.Tab) -> bool:
    try:
        r = await page.evaluate(
            """(() => {
              const t = (document.title || '').toLowerCase();
              const h = (document.documentElement && document.documentElement.outerHTML)
                ? document.documentElement.outerHTML.toLowerCase() : '';
              if (t.includes('just a moment')) return true;
              if (t.includes('attention required') && h.includes('cloudflare')) return true;
              if (h.includes('challenges.cloudflare.com')) return true;
              if (h.includes('cf-challenge-running')) return true;
              if (h.includes('challenge-running') && h.includes('cf-')) return true;
              if (h.includes('checking your browser')) return true;
              return false;
            })()""",
            return_by_value=True,
        )
    except Exception:
        return False
    return r is True


async def _wait_out_cloudflare(page: uc.Tab, max_seconds: float) -> None:
    deadline = time.monotonic() + max_seconds
    warned = False
    while time.monotonic() < deadline:
        if not await _page_looks_like_cf_challenge(page):
            return
        if not warned:
            log.info(
                "Cloudflare challenge detected — waiting up to %.0fs for it to clear "
                "(persistent profile helps on repeat visits)",
                max_seconds,
            )
            warned = True
        await page.sleep(0.5)
    if await _page_looks_like_cf_challenge(page):
        raise CloudflareChallengeTimeout(
            f"Still on a Cloudflare challenge after {max_seconds:.0f}s"
        )


async def _get_lock(url: str) -> asyncio.Lock:
    async with _locks_mutex:
        if url not in _locks:
            _locks[url] = asyncio.Lock()
        return _locks[url]


def _chrome_kwargs() -> dict:
    pathlib.Path(CHROME_PROXY_USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
    browser_args = [
        "--window-size=1920,1080",
        "--disable-blink-features=AutomationControlled",
    ]
    if CHROME_PROXY_SERVER:
        browser_args.append(f"--proxy-server={CHROME_PROXY_SERVER}")
        log.info("Chrome will use upstream proxy: %s", CHROME_PROXY_SERVER.split("@")[-1])
    if CHROME_PROXY_BYPASS_LIST:
        browser_args.append(f"--proxy-bypass-list={CHROME_PROXY_BYPASS_LIST}")
    kwargs: dict = {
        "user_data_dir": CHROME_PROXY_USER_DATA_DIR,
        "browser_args": browser_args,
    }
    if CHROME_BINARY and os.path.isfile(CHROME_BINARY):
        kwargs["browser_executable_path"] = CHROME_BINARY
    return kwargs


async def _get_browser() -> uc.Browser:
    """Return the shared browser, (re)starting it if necessary."""
    global _browser
    async with _browser_lock:
        if _browser is None:
            log.info("Starting shared Chrome instance")
            _browser = await uc.start(**_chrome_kwargs())
            log.info("Chrome instance ready")
        return _browser


async def fetch_via_browser(url: str) -> str:
    global _browser
    log.info("Fetching via shared browser: %s", url)
    try:
        browser = await _get_browser()
        page = await browser.get(url)
        await page.sleep(PAGE_SETTLE_SECONDS)
        await _wait_out_cloudflare(page, CHROME_PROXY_CF_MAX_WAIT)
        await page.sleep(1)
        # When the response is plain JSON/text, Chrome wraps it in its JSON viewer:
        # <body><pre>...</pre></body>.  Extract the raw text instead of returning
        # the full HTML wrapper.
        return await page.evaluate(
            "(function(){"
            "  var pre = document.querySelector('body > pre');"
            "  return pre ? pre.textContent : document.documentElement.outerHTML;"
            "})()"
        )
    except CloudflareChallengeTimeout:
        raise
    except Exception:
        # If Chrome crashed or became unresponsive, discard the instance so the
        # next request triggers a fresh start rather than retrying a dead browser.
        log.warning("Browser fetch failed — discarding Chrome instance for restart on next request")
        async with _browser_lock:
            _browser = None
        raise


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
    # Read from the raw query string so that params like &foo=1&bar=2 that follow
    # the target URL are preserved as part of it rather than being parsed as
    # separate proxy-level query params (which is what .query.get("url") would do).
    query_string = request.rel_url.query_string
    if "url=" in query_string:
        raw_url = unquote(query_string.split("url=", 1)[1]).strip()
    else:
        raw_url = ""
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
        # Sniff content type: if the body starts with { or [ it's JSON.
        stripped = content.lstrip()
        if stripped.startswith(("{", "[")):
            ct = "application/json"
        elif stripped.startswith("<"):
            ct = "text/html"
        else:
            ct = "text/plain"
        return web.Response(text=content, content_type=ct)
    except CloudflareChallengeTimeout as e:
        log.warning("%s", e)
        return web.Response(
            text=(
                f"Cloudflare challenge did not clear in time: {e}\n"
                "Try: open the same URL once in a real Chrome profile using this proxy's "
                f"user-data dir ({CHROME_PROXY_USER_DATA_DIR}), or increase CHROME_PROXY_CF_MAX_WAIT."
            ),
            status=503,
        )
    except Exception:
        log.exception("Failed to fetch %s", url)
        return web.Response(text=f"Error fetching {url}", status=502)


async def handle_health(request: web.Request) -> web.Response:
    return web.Response(text="ok")


async def on_startup(app: web.Application) -> None:
    """Pre-warm Chrome so the first real request isn't slow."""
    try:
        await _get_browser()
    except Exception:
        log.warning("Chrome pre-warm failed — will retry on first request")


async def on_shutdown(app: web.Application) -> None:
    global _browser
    if _browser is not None:
        log.info("Stopping shared Chrome instance")
        try:
            _browser.stop()
        except Exception:
            pass
        _browser = None


def main() -> None:
    parser = argparse.ArgumentParser(description="Headless-browser HTTP proxy")
    parser.add_argument("--port", type=int, default=50015, help="Port to listen on (default: 50015)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    args = parser.parse_args()

    app = web.Application()
    app.router.add_get("/", handle_request)
    app.router.add_get("/health", handle_health)
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    log.info("Starting proxy on %s:%d", args.host, args.port)
    web.run_app(app, host=args.host, port=args.port, print=lambda msg: log.info(msg))


if __name__ == "__main__":
    main()
