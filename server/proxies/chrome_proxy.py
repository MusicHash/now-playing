#!/usr/bin/env python3
"""
HTTP reverse proxy that fetches arbitrary URLs through a real browser or
cloudscraper (Cloudflare-oriented TLS/JA3 fingerprinting) to reduce bot blocks.

Usage:
    python3 chrome_proxy.py [--port PORT] [--host HOST] [--fetch-backend BACKEND]
    xvfb-run -a python3 chrome_proxy.py --fetch-backend cloudscraper
    ./run_chrome_proxy.sh

Request format:
    GET /?url=https://example.com/api/endpoint?foo=bar&baz=1
    GET /health

Dependencies:
    pip install aiohttp
    pip install nodriver                    # only for --fetch-backend chrome
    pip install cloudscraper                # only for --fetch-backend cloudscraper

Environment:
    CHROME_PROXY_FETCH_BACKEND — chrome (default) | cloudscraper
    CHROME_PROXY_USER_DATA_DIR — Chrome profile dir (chrome backend only).
    CHROME_PROXY_CF_MAX_WAIT — Seconds to wait for Cloudflare challenge (chrome).
    CHROME_PROXY_HTTP_TIMEOUT — Seconds for cloudscraper HTTP GET (default: 60).
    CHROME_PROXY_SERVER — Upstream proxy (both backends). Examples:
        http://proxy.example.com:8080  |  socks5://127.0.0.1:1080
        Chrome: user:pass via nodriver forwarder. cloudscraper: sets Session.proxies
        (http + https) so all requests, including challenge passes, use the same URL.
    CHROME_PROXY_BYPASS_LIST — Chrome --proxy-bypass-list only (chrome backend).
"""

import importlib.util
import pathlib


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


import argparse
import asyncio
import logging
import os
import time
from typing import Protocol
from urllib.parse import unquote, urlparse

from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

CHROME_BINARY = os.path.expanduser("~/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome")
_DEFAULT_PROFILE = os.path.join(
    os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")),
    "now-playing",
    "chrome-proxy-profile",
)
CHROME_PROXY_USER_DATA_DIR = os.environ.get("CHROME_PROXY_USER_DATA_DIR", _DEFAULT_PROFILE)
CHROME_PROXY_CF_MAX_WAIT = float(os.environ.get("CHROME_PROXY_CF_MAX_WAIT", "45"))
CHROME_PROXY_HTTP_TIMEOUT = float(os.environ.get("CHROME_PROXY_HTTP_TIMEOUT", "60"))
CHROME_PROXY_SERVER = os.environ.get("CHROME_PROXY_SERVER", "").strip()
CHROME_PROXY_BYPASS_LIST = os.environ.get("CHROME_PROXY_BYPASS_LIST", "").strip()

DEFAULT_FETCH_BACKEND = os.environ.get("CHROME_PROXY_FETCH_BACKEND", "chrome").strip().lower()


def _proxy_upstream_log_label(proxy_url: str) -> str:
    try:
        p = urlparse(proxy_url)
        if p.hostname:
            port = f":{p.port}" if p.port else ""
            return f"{p.hostname}{port}"
    except Exception:
        pass
    return proxy_url.rsplit("@", 1)[-1]


CACHE_TTL_SECONDS = 15
PAGE_SETTLE_SECONDS = 2

_cache: dict[str, dict] = {}
_locks: dict[str, asyncio.Lock] = {}
_locks_mutex = asyncio.Lock()

_fetch_provider: "FetchProvider | None" = None


class CloudflareChallengeTimeout(Exception):
    """Page still looks like a Cloudflare interstitial after max wait."""


def _nodriver():
    _patch_nodriver_network_py_if_needed()
    import nodriver as uc

    return uc


class FetchProvider(Protocol):
    async def fetch(self, url: str) -> str: ...

    async def startup(self) -> None: ...

    async def shutdown(self) -> None: ...


def _html_looks_like_cf_challenge(html: str) -> bool:
    t = ""
    try:
        # Best-effort title sniff without parsing full DOM
        import re

        m = re.search(r"<title[^>]*>([^<]*)</title>", html, re.I | re.S)
        if m:
            t = m.group(1).lower()
    except Exception:
        pass
    h = html.lower()
    if "just a moment" in t:
        return True
    if "attention required" in t and "cloudflare" in h:
        return True
    if "challenges.cloudflare.com" in h:
        return True
    if "cf-challenge-running" in h:
        return True
    if "checking your browser" in h:
        return True
    return False


class CloudscraperFetchProvider:
    async def startup(self) -> None:
        return None

    async def shutdown(self) -> None:
        return None

    def _fetch_sync(self, url: str) -> str:
        import cloudscraper

        scraper = cloudscraper.create_scraper()
        proxy_url = CHROME_PROXY_SERVER.strip()
        if proxy_url:
            scraper.proxies = {"http": proxy_url, "https": proxy_url}
            log.info(
                "cloudscraper upstream proxy: %s",
                _proxy_upstream_log_label(proxy_url),
            )
        r = scraper.get(url, timeout=CHROME_PROXY_HTTP_TIMEOUT)
        r.raise_for_status()
        text = r.text
        if _html_looks_like_cf_challenge(text):
            raise CloudflareChallengeTimeout(
                "cloudscraper received a page that still looks like a Cloudflare challenge"
            )
        return text

    async def fetch(self, url: str) -> str:
        log.info("Fetching via cloudscraper: %s", url)
        return await asyncio.to_thread(self._fetch_sync, url)


class ChromeFetchProvider:
    def __init__(self) -> None:
        self._browser = None
        self._browser_lock = asyncio.Lock()
        self._proxy_forwarder = None

    async def _page_looks_like_cf_challenge(self, page) -> bool:
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

    async def _wait_out_cloudflare(self, page, max_seconds: float) -> None:
        deadline = time.monotonic() + max_seconds
        warned = False
        while time.monotonic() < deadline:
            if not await self._page_looks_like_cf_challenge(page):
                return
            if not warned:
                log.info(
                    "Cloudflare challenge detected — waiting up to %.0fs for it to clear "
                    "(persistent profile helps on repeat visits)",
                    max_seconds,
                )
                warned = True
            await page.sleep(0.5)
        if await self._page_looks_like_cf_challenge(page):
            raise CloudflareChallengeTimeout(
                f"Still on a Cloudflare challenge after {max_seconds:.0f}s"
            )

    @staticmethod
    def _proxy_url_has_credentials(proxy_url: str) -> bool:
        try:
            p = urlparse(proxy_url)
            return bool(p.username or p.password)
        except Exception:
            return False

    async def _chrome_proxy_server_flag_value(self) -> str:
        uc = _nodriver()
        raw = CHROME_PROXY_SERVER.strip()
        if not raw:
            return ""
        if self._proxy_url_has_credentials(raw):
            if self._proxy_forwarder is None:
                self._proxy_forwarder = uc.util.ProxyForwarder(raw)
                for _ in range(100):
                    await asyncio.sleep(0.02)
                    if getattr(self._proxy_forwarder, "server", None) is not None:
                        break
            return self._proxy_forwarder.proxy_server
        return raw

    def _chrome_kwargs(self, proxy_server_flag: str) -> dict:
        pathlib.Path(CHROME_PROXY_USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
        browser_args = [
            "--window-size=1920,1080",
            "--disable-blink-features=AutomationControlled",
        ]
        if proxy_server_flag:
            browser_args.append(f"--proxy-server={proxy_server_flag}")
            log.info(
                "Chrome upstream proxy: %s",
                _proxy_upstream_log_label(CHROME_PROXY_SERVER),
            )
        if CHROME_PROXY_BYPASS_LIST:
            browser_args.append(f"--proxy-bypass-list={CHROME_PROXY_BYPASS_LIST}")
        kwargs: dict = {
            "user_data_dir": CHROME_PROXY_USER_DATA_DIR,
            "browser_args": browser_args,
        }
        if CHROME_BINARY and os.path.isfile(CHROME_BINARY):
            kwargs["browser_executable_path"] = CHROME_BINARY
        return kwargs

    async def _get_browser(self):
        uc = _nodriver()
        async with self._browser_lock:
            if self._browser is None:
                log.info("Starting shared Chrome instance")
                proxy_flag = await self._chrome_proxy_server_flag_value()
                self._browser = await uc.start(**self._chrome_kwargs(proxy_flag))
                log.info("Chrome instance ready")
            return self._browser

    async def fetch(self, url: str) -> str:
        log.info("Fetching via shared browser: %s", url)
        try:
            browser = await self._get_browser()
            page = await browser.get(url)
            await page.sleep(PAGE_SETTLE_SECONDS)
            await self._wait_out_cloudflare(page, CHROME_PROXY_CF_MAX_WAIT)
            await page.sleep(1)
            return await page.evaluate(
                "(function(){"
                "  var pre = document.querySelector('body > pre');"
                "  return pre ? pre.textContent : document.documentElement.outerHTML;"
                "})()"
            )
        except CloudflareChallengeTimeout:
            raise
        except Exception:
            log.warning("Browser fetch failed — discarding Chrome instance for restart on next request")
            async with self._browser_lock:
                self._browser = None
            raise

    async def startup(self) -> None:
        try:
            await self._get_browser()
        except Exception:
            log.warning("Chrome pre-warm failed — will retry on first request")

    async def shutdown(self) -> None:
        if self._browser is not None:
            log.info("Stopping shared Chrome instance")
            try:
                self._browser.stop()
            except Exception:
                pass
            self._browser = None
        fw = self._proxy_forwarder
        self._proxy_forwarder = None
        if fw is not None:
            srv = getattr(fw, "server", None)
            if srv is not None:
                srv.close()
                await srv.wait_closed()


def create_fetch_provider(kind: str) -> FetchProvider:
    """Instantiate a fetch backend by name (extensible for future providers)."""
    k = kind.strip().lower()
    if k == "chrome":
        return ChromeFetchProvider()
    if k == "cloudscraper":
        return CloudscraperFetchProvider()
    raise ValueError(f"Unknown fetch backend {kind!r}; use chrome or cloudscraper")


async def _get_lock(url: str) -> asyncio.Lock:
    async with _locks_mutex:
        if url not in _locks:
            _locks[url] = asyncio.Lock()
        return _locks[url]


async def get_cached(url: str) -> str:
    if _fetch_provider is None:
        raise RuntimeError("fetch provider not configured")

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

        content = await _fetch_provider.fetch(url)
        _cache[url] = {"content": content, "fetched_at": time.monotonic()}
        return content


def validate_url(raw: str) -> str | None:
    try:
        parsed = urlparse(unquote(raw))
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return parsed.geturl()
    except Exception:
        pass
    return None


async def handle_request(request: web.Request) -> web.Response:
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
                "Try: another backend (--fetch-backend), a warmed Chrome profile "
                f"({CHROME_PROXY_USER_DATA_DIR}), or increase CHROME_PROXY_CF_MAX_WAIT / tune cloudscraper."
            ),
            status=503,
        )
    except Exception:
        log.exception("Failed to fetch %s", url)
        return web.Response(text=f"Error fetching {url}", status=502)


async def handle_health(request: web.Request) -> web.Response:
    return web.Response(text="ok")


async def on_startup(app: web.Application) -> None:
    p = app["fetch_provider"]
    await p.startup()


async def on_shutdown(app: web.Application) -> None:
    p = app["fetch_provider"]
    await p.shutdown()


def main() -> None:
    global _fetch_provider

    parser = argparse.ArgumentParser(description="HTTP fetch proxy (Chrome or cloudscraper)")
    parser.add_argument("--port", type=int, default=50015, help="Port to listen on (default: 50015)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument(
        "--fetch-backend",
        default=DEFAULT_FETCH_BACKEND,
        choices=("chrome", "cloudscraper"),
        help="Fetch implementation (default: env CHROME_PROXY_FETCH_BACKEND or chrome)",
    )
    args = parser.parse_args()

    _fetch_provider = create_fetch_provider(args.fetch_backend)
    log.info("Fetch backend: %s", args.fetch_backend)

    app = web.Application()
    app["fetch_provider"] = _fetch_provider
    app.router.add_get("/", handle_request)
    app.router.add_get("/health", handle_health)
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    log.info("Starting proxy on %s:%d", args.host, args.port)
    web.run_app(app, host=args.host, port=args.port, print=lambda msg: log.info(msg))


if __name__ == "__main__":
    main()
