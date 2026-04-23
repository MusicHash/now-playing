#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import time
from itertools import islice
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple
from urllib.parse import parse_qs, unquote, urlparse

import pymysql
import redis
import requests


DEFAULT_SPOTIFY_BATCH_SIZE = 50
DEFAULT_REDIS_SCAN_COUNT = 1000
DEFAULT_REDIS_READ_BATCH = 200
DEFAULT_DB_WRITE_BATCH = 500
DEFAULT_HTTP_TIMEOUT_SECONDS = 30
MYSQL_RETRYABLE_ERROR_CODES = {2006, 2013, 2055}

UPDATE_RELEASE_DATE_SQL = """
UPDATE `nowplaying_spotify_tracks`
SET `spotify_release_date` = %s
WHERE `spotify_track_id` = %s
  AND `spotify_release_date` IS NULL
""".strip()

SELECT_MISSING_TRACK_IDS_SQL = """
SELECT MIN(`spotify_id`) AS `cursor_spotify_id`, `spotify_track_id`
FROM `nowplaying_spotify_tracks`
WHERE `spotify_release_date` IS NULL
  AND `spotify_track_id` IS NOT NULL
  AND `spotify_track_id` <> ''
  AND `spotify_id` > %s
GROUP BY `spotify_track_id`
ORDER BY `cursor_spotify_id`
LIMIT %s
""".strip()


def log(message: str) -> None:
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        os.environ.setdefault(key, value)


def normalize_release_date(raw: Any, precision: Any) -> Optional[str]:
    if not isinstance(raw, str):
        return None

    raw = raw.strip()
    precision = precision.strip() if isinstance(precision, str) else ""

    if not raw:
        return None

    if precision == "year" and len(raw) == 4 and raw.isdigit():
        return f"{raw}-01-01"
    if precision == "month" and len(raw) == 7:
        parts = raw.split("-")
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            return f"{raw}-01"
    if precision == "day" and len(raw) == 10:
        parts = raw.split("-")
        if len(parts) == 3 and all(part.isdigit() for part in parts):
            return raw

    if len(raw) == 10:
        parts = raw.split("-")
        if len(parts) == 3 and all(part.isdigit() for part in parts):
            return raw
    if len(raw) == 7:
        parts = raw.split("-")
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            return f"{raw}-01"
    if len(raw) == 4 and raw.isdigit():
        return f"{raw}-01-01"

    return None


def chunked(iterable: Iterable[Any], size: int) -> Iterator[List[Any]]:
    iterator = iter(iterable)
    while True:
        chunk = list(islice(iterator, size))
        if not chunk:
            return
        yield chunk


def mysql_connect(mysql_uri: str):
    parsed = urlparse(mysql_uri)
    if parsed.scheme not in {"mysql", "mysql2"}:
        raise ValueError("MYSQL_URI must start with mysql:// or mysql2://")
    if not parsed.hostname:
        raise ValueError("MYSQL_URI is missing host")
    database = parsed.path.lstrip("/")
    if not database:
        raise ValueError("MYSQL_URI is missing database name")

    query = parse_qs(parsed.query, keep_blank_values=True)
    charset = query.get("charset", ["utf8mb4"])[0] or "utf8mb4"

    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        database=database,
        charset=charset,
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def is_retryable_mysql_error(exc: BaseException) -> bool:
    if not isinstance(exc, pymysql.MySQLError):
        return False
    if not exc.args:
        return False
    code = exc.args[0]
    return isinstance(code, int) and code in MYSQL_RETRYABLE_ERROR_CODES


def rollback_quietly(conn) -> None:
    try:
        conn.rollback()
    except pymysql.MySQLError:
        return


def ensure_mysql_connection(conn) -> None:
    conn.ping(reconnect=True)


def mysql_execute(conn, sql: str, params: Any, *, fetchall: bool = False, many: bool = False) -> Any:
    for attempt in range(2):
        try:
            ensure_mysql_connection(conn)
            with conn.cursor() as cursor:
                if many:
                    cursor.executemany(sql, params)
                else:
                    cursor.execute(sql, params)

                if fetchall:
                    return list(cursor.fetchall())

                rowcount = int(cursor.rowcount or 0)

            conn.commit()
            return rowcount
        except pymysql.MySQLError as exc:
            rollback_quietly(conn)
            if attempt == 0 and is_retryable_mysql_error(exc):
                log(
                    f"MySQL connection dropped (code={exc.args[0]}), reconnecting and retrying query once"
                )
                continue
            raise


def redis_connect(redis_uri: str):
    parsed = urlparse(redis_uri)
    if parsed.scheme not in {"redis", "rediss"}:
        raise ValueError("REDIS_URI must start with redis:// or rediss://")
    if not parsed.hostname:
        raise ValueError("REDIS_URI is missing host")

    query = parse_qs(parsed.query, keep_blank_values=True)

    db = 0
    path_db = parsed.path.lstrip("/")
    if path_db.isdigit():
        db = int(path_db)
    else:
        query_db = query.get("db", query.get("database", []))
        if query_db and query_db[0].isdigit():
            db = int(query_db[0])

    kwargs: Dict[str, Any] = {
        "host": parsed.hostname,
        "port": parsed.port or 6379,
        "db": db,
        "username": unquote(parsed.username) if parsed.username else None,
        "password": unquote(parsed.password) if parsed.password else None,
        "decode_responses": True,
    }

    client_name = query.get("client_name", query.get("clientName", []))
    if client_name and client_name[0]:
        kwargs["client_name"] = client_name[0]

    socket_timeout = query.get("socket_timeout", query.get("timeout", []))
    if socket_timeout and socket_timeout[0]:
        try:
            kwargs["socket_timeout"] = float(socket_timeout[0])
        except ValueError:
            pass

    if parsed.scheme == "rediss":
        kwargs["ssl"] = True

    client = redis.Redis(**kwargs)

    try:
        client.ping()
        return client
    except redis.exceptions.AuthenticationError as exc:
        message = str(exc)
        password_only_auth = kwargs.get("password") and not kwargs.get("username")
        server_has_no_password = "without any password configured" in message

        if password_only_auth and server_has_no_password:
            fallback_kwargs = dict(kwargs)
            fallback_kwargs.pop("password", None)
            log(
                "Redis rejected password auth because the server has no password configured; "
                "retrying without AUTH"
            )
            fallback_client = redis.Redis(**fallback_kwargs)
            fallback_client.ping()
            return fallback_client

        raise


def flush_release_date_updates(
    conn,
    pending_updates: Dict[str, str],
    summary: Dict[str, int],
) -> None:
    if not pending_updates:
        return

    params = [(release_date, track_id) for track_id, release_date in pending_updates.items()]
    rowcount = int(mysql_execute(conn, UPDATE_RELEASE_DATE_SQL, params, many=True) or 0)
    summary["db_write_batches"] += 1
    summary["track_ids_written"] += len(params)
    summary["db_rows_updated"] += rowcount
    pending_updates.clear()


def extract_track_updates_from_song_cache(payload: Any) -> List[Tuple[str, str]]:
    if not isinstance(payload, dict):
        return []

    tracks = payload.get("tracks")
    if isinstance(tracks, dict):
        items = tracks.get("items")
    else:
        items = payload.get("items")

    if not isinstance(items, list):
        return []

    updates: List[Tuple[str, str]] = []

    for item in items:
        if not isinstance(item, dict):
            continue

        track_id = item.get("id")
        if not isinstance(track_id, str) or not track_id.strip():
            continue

        album = item.get("album")
        if not isinstance(album, dict):
            continue

        release_date = normalize_release_date(
            album.get("release_date"),
            album.get("release_date_precision"),
        )
        if not release_date:
            continue

        updates.append((track_id.strip(), release_date))

    return updates


def run_redis_backfill(
    conn,
    redis_client,
    scan_count: int,
    read_batch_size: int,
    db_write_batch_size: int,
) -> Dict[str, int]:
    summary = {
        "keys_scanned": 0,
        "cache_payloads_loaded": 0,
        "cache_payloads_invalid_json": 0,
        "track_hits_seen": 0,
        "unique_track_ids_seen": 0,
        "track_ids_written": 0,
        "db_rows_updated": 0,
        "db_write_batches": 0,
    }

    seen_track_ids = set()
    pending_updates: Dict[str, str] = {}

    for key_batch in chunked(
        redis_client.scan_iter(match="SONG:*", count=scan_count),
        read_batch_size,
    ):
        summary["keys_scanned"] += len(key_batch)

        pipeline = redis_client.pipeline(transaction=False)
        for key in key_batch:
            pipeline.get(key)
        values = pipeline.execute()

        for raw_payload in values:
            if not raw_payload:
                continue

            try:
                payload = json.loads(raw_payload)
            except json.JSONDecodeError:
                summary["cache_payloads_invalid_json"] += 1
                continue

            summary["cache_payloads_loaded"] += 1
            updates = extract_track_updates_from_song_cache(payload)
            summary["track_hits_seen"] += len(updates)

            for track_id, release_date in updates:
                if track_id in seen_track_ids:
                    continue
                seen_track_ids.add(track_id)
                pending_updates[track_id] = release_date
                summary["unique_track_ids_seen"] += 1

                if len(pending_updates) >= db_write_batch_size:
                    flush_release_date_updates(conn, pending_updates, summary)

    flush_release_date_updates(conn, pending_updates, summary)
    return summary


class SpotifyClient:
    def __init__(self, client_id: str, client_secret: str, timeout_seconds: int) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()
        self.access_token: Optional[str] = None
        self.expires_at: float = 0.0

    def _basic_auth_header(self) -> str:
        raw = f"{self.client_id}:{self.client_secret}".encode("utf-8")
        return base64.b64encode(raw).decode("ascii")

    def _refresh_access_token(self) -> None:
        res = self.session.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {self._basic_auth_header()}"},
            timeout=self.timeout_seconds,
        )
        res.raise_for_status()
        body = res.json()

        token = body.get("access_token")
        expires_in = int(body.get("expires_in", 3600))
        if not isinstance(token, str) or not token:
            raise RuntimeError("Spotify token response did not contain access_token")

        self.access_token = token
        self.expires_at = time.time() + max(0, expires_in - 60)

    def _ensure_access_token(self) -> None:
        if self.access_token and time.time() < self.expires_at:
            return
        self._refresh_access_token()

    def get_tracks(self, track_ids: Sequence[str]) -> List[Any]:
        if not track_ids:
            return []

        self._ensure_access_token()
        params = {"ids": ",".join(track_ids)}
        headers = {"Authorization": f"Bearer {self.access_token}"}

        res = self.session.get(
            "https://api.spotify.com/v1/tracks",
            params=params,
            headers=headers,
            timeout=self.timeout_seconds,
        )

        if res.status_code == 401:
            self._refresh_access_token()
            headers["Authorization"] = f"Bearer {self.access_token}"
            res = self.session.get(
                "https://api.spotify.com/v1/tracks",
                params=params,
                headers=headers,
                timeout=self.timeout_seconds,
            )

        if res.status_code == 429:
            retry_after = res.headers.get("Retry-After", "1")
            try:
                sleep_seconds = max(1, min(60, int(retry_after)))
            except ValueError:
                sleep_seconds = 1
            log(f"Spotify rate limit hit, sleeping {sleep_seconds}s before retry")
            time.sleep(sleep_seconds)
            res = self.session.get(
                "https://api.spotify.com/v1/tracks",
                params=params,
                headers=headers,
                timeout=self.timeout_seconds,
            )

        res.raise_for_status()
        body = res.json()
        tracks = body.get("tracks")
        if not isinstance(tracks, list):
            raise RuntimeError("Spotify /v1/tracks response did not contain a tracks list")
        return tracks


def select_missing_track_ids(conn, last_cursor_id: int, limit: int) -> List[Dict[str, Any]]:
    return mysql_execute(
        conn,
        SELECT_MISSING_TRACK_IDS_SQL,
        (last_cursor_id, limit),
        fetchall=True,
    )


def run_spotify_backfill(
    conn,
    spotify_client: SpotifyClient,
    spotify_batch_size: int,
    db_write_batch_size: int,
    limit_total: Optional[int],
) -> Dict[str, int]:
    summary = {
        "candidate_track_ids_selected": 0,
        "spotify_requests": 0,
        "spotify_tracks_returned": 0,
        "spotify_tracks_missing": 0,
        "spotify_tracks_without_release_date": 0,
        "track_ids_written": 0,
        "db_rows_updated": 0,
        "db_write_batches": 0,
    }

    last_cursor_id = 0
    processed_unique_track_ids = 0
    pending_updates: Dict[str, str] = {}

    while True:
        remaining = None if limit_total is None else max(0, limit_total - processed_unique_track_ids)
        if remaining == 0:
            break

        select_limit = spotify_batch_size if remaining is None else min(spotify_batch_size, remaining)
        rows = select_missing_track_ids(conn, last_cursor_id, select_limit)
        if not rows:
            break

        last_cursor_id = int(rows[-1]["cursor_spotify_id"])
        track_ids = [
            row["spotify_track_id"].strip()
            for row in rows
            if isinstance(row.get("spotify_track_id"), str) and row["spotify_track_id"].strip()
        ]
        if not track_ids:
            continue

        processed_unique_track_ids += len(track_ids)
        summary["candidate_track_ids_selected"] += len(track_ids)
        summary["spotify_requests"] += 1

        tracks = spotify_client.get_tracks(track_ids)
        summary["spotify_tracks_returned"] += len(tracks)

        track_map = {}
        for track in tracks:
            if not isinstance(track, dict):
                continue
            track_id = track.get("id")
            if not isinstance(track_id, str) or not track_id.strip():
                continue
            track_map[track_id.strip()] = track

        for track_id in track_ids:
            track = track_map.get(track_id)
            if track is None:
                summary["spotify_tracks_missing"] += 1
                continue

            album = track.get("album")
            if not isinstance(album, dict):
                summary["spotify_tracks_without_release_date"] += 1
                continue

            release_date = normalize_release_date(
                album.get("release_date"),
                album.get("release_date_precision"),
            )
            if not release_date:
                summary["spotify_tracks_without_release_date"] += 1
                continue

            pending_updates[track_id] = release_date
            if len(pending_updates) >= db_write_batch_size:
                flush_release_date_updates(conn, pending_updates, summary)

    flush_release_date_updates(conn, pending_updates, summary)
    return summary


def require_env(name: str, cli_value: Optional[str]) -> str:
    value = (cli_value or os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description=(
            "Backfill nowplaying_spotify_tracks.spotify_release_date from Redis SONG:* cache "
            "and/or Spotify API."
        )
    )
    parser.add_argument(
        "--mode",
        choices=("redis", "spotify", "all"),
        required=True,
        help="Choose the backfill pass to run.",
    )
    parser.add_argument(
        "--env-file",
        default=str(repo_root / ".env"),
        help="Optional .env file to load before reading env vars.",
    )
    parser.add_argument("--mysql-uri", default=None, help="Override MYSQL_URI.")
    parser.add_argument("--redis-uri", default=None, help="Override REDIS_URI.")
    parser.add_argument("--spotify-client-id", default=None, help="Override SPOTIFY_CLIENT_ID.")
    parser.add_argument(
        "--spotify-client-secret",
        default=None,
        help="Override SPOTIFY_CLIENT_SECRET.",
    )
    parser.add_argument(
        "--spotify-batch-size",
        type=int,
        default=DEFAULT_SPOTIFY_BATCH_SIZE,
        help="Spotify /v1/tracks ids per request (max 50).",
    )
    parser.add_argument(
        "--redis-scan-count",
        type=int,
        default=DEFAULT_REDIS_SCAN_COUNT,
        help="Redis SCAN COUNT hint for SONG:* iteration.",
    )
    parser.add_argument(
        "--redis-read-batch",
        type=int,
        default=DEFAULT_REDIS_READ_BATCH,
        help="How many SONG:* keys to GET per Redis pipeline batch.",
    )
    parser.add_argument(
        "--db-write-batch",
        type=int,
        default=DEFAULT_DB_WRITE_BATCH,
        help="How many track ids to update per DB executemany call.",
    )
    parser.add_argument(
        "--limit-total",
        type=int,
        default=None,
        help="Optional cap for Spotify mode unique track ids processed in this run.",
    )
    parser.add_argument(
        "--http-timeout-seconds",
        type=int,
        default=DEFAULT_HTTP_TIMEOUT_SECONDS,
        help="HTTP timeout for Spotify token and tracks requests.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.env_file:
        load_env_file(Path(args.env_file))

    mysql_uri = require_env("MYSQL_URI", args.mysql_uri)
    conn = mysql_connect(mysql_uri)

    try:
        if args.mode in {"redis", "all"}:
            redis_uri = require_env("REDIS_URI", args.redis_uri)
            log("Starting Redis first pass from SONG:* cache")
            redis_client = redis_connect(redis_uri)
            redis_summary = run_redis_backfill(
                conn=conn,
                redis_client=redis_client,
                scan_count=max(1, int(args.redis_scan_count)),
                read_batch_size=max(1, int(args.redis_read_batch)),
                db_write_batch_size=max(1, int(args.db_write_batch)),
            )
            log(f"Redis pass summary: {json.dumps(redis_summary, sort_keys=True)}")

        if args.mode in {"spotify", "all"}:
            spotify_client_id = require_env("SPOTIFY_CLIENT_ID", args.spotify_client_id)
            spotify_client_secret = require_env(
                "SPOTIFY_CLIENT_SECRET",
                args.spotify_client_secret,
            )
            log("Starting Spotify batch pass for rows still missing release dates")
            spotify_client = SpotifyClient(
                client_id=spotify_client_id,
                client_secret=spotify_client_secret,
                timeout_seconds=max(1, int(args.http_timeout_seconds)),
            )
            spotify_summary = run_spotify_backfill(
                conn=conn,
                spotify_client=spotify_client,
                spotify_batch_size=max(1, min(50, int(args.spotify_batch_size))),
                db_write_batch_size=max(1, int(args.db_write_batch)),
                limit_total=args.limit_total,
            )
            log(f"Spotify pass summary: {json.dumps(spotify_summary, sort_keys=True)}")

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Interrupted")
        raise SystemExit(130)
    except Exception as exc:
        log(f"Fatal error: {exc}")
        raise SystemExit(1)
