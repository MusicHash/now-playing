#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urlparse

import pymysql
import requests

DEFAULT_HTTP_TIMEOUT_SECONDS = 120
MYSQL_RETRYABLE_ERROR_CODES = {2006, 2013, 2055}

SELECT_MISSING_ROWS_SQL = """
SELECT
    t.`spotify_id`,
    t.`spotify_track_id`,
    t.`spotify_artist_title`,
    t.`spotify_track_title`
FROM `nowplaying_spotify_tracks` t
WHERE t.`spotify_track_id` IS NOT NULL
  AND TRIM(t.`spotify_track_id`) <> ''
  AND NOT EXISTS (
        SELECT 1
        FROM `nowplaying_spotify_track_genres` g
        WHERE g.`spotify_id` = t.`spotify_id`
           OR g.`spotify_track_id` = t.`spotify_track_id`
  )
ORDER BY t.`spotify_id`
""".strip()

INSERT_TRACK_GENRE_IF_MISSING_SQL = """
INSERT INTO `nowplaying_spotify_track_genres`
(`spotify_id`, `spotify_track_id`, `genre`, `additional_tags`)
SELECT %s, %s, %s, %s
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1
    FROM `nowplaying_spotify_track_genres`
    WHERE `spotify_id` = %s
       OR `spotify_track_id` = %s
)
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


def require_env(name: str, cli_value: Optional[str]) -> str:
    value = (cli_value or os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


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


def mysql_execute(conn, sql: str, params: tuple[Any, ...] = (), *, fetchall: bool = False) -> Any:
    for attempt in range(2):
        try:
            ensure_mysql_connection(conn)
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                if fetchall:
                    return list(cursor.fetchall())
            conn.commit()
            return None
        except pymysql.MySQLError as exc:
            rollback_quietly(conn)
            if attempt == 0 and is_retryable_mysql_error(exc):
                log(
                    f"MySQL connection dropped (code={exc.args[0]}), reconnecting and retrying query once"
                )
                continue
            raise


def select_missing_rows(conn) -> list[dict[str, Any]]:
    return mysql_execute(conn, SELECT_MISSING_ROWS_SQL, fetchall=True)


def fetch_kaggle_track_json(
    base_url: str,
    spotify_track_id: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/kaggle/track/{spotify_track_id}"
    started_at = time.perf_counter()

    try:
        response = requests.get(
            url,
            headers={"Accept": "application/json"},
            timeout=timeout_seconds,
        )
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        try:
            payload = response.json()
        except ValueError:
            payload = None

        return {
            "response": response,
            "json": payload,
            "elapsed_ms": elapsed_ms,
            "error": None,
        }
    except requests.RequestException as exc:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        return {
            "response": None,
            "json": None,
            "elapsed_ms": elapsed_ms,
            "error": str(exc),
        }


def extract_genres(body: Any, spotify_track_id: str) -> list[str]:
    if not isinstance(body, dict):
        return []

    api_id = str(body.get("id") or "").strip()
    if api_id and api_id != spotify_track_id:
        return []

    raw_genres = body.get("track_genres")
    if not isinstance(raw_genres, list):
        return []

    deduped: list[str] = []
    seen = set()
    for raw_genre in raw_genres:
        genre = str(raw_genre or "").strip()
        if not genre or genre in seen:
            continue
        seen.add(genre)
        deduped.append(genre)
    return deduped


def insert_track_genre_if_missing(
    conn,
    spotify_id: int,
    spotify_track_id: str,
    main_genre: str,
    additional_tags: list[str],
    *,
    dry_run: bool = False,
) -> bool:
    payload = json.dumps(additional_tags, ensure_ascii=True) if additional_tags else None
    if dry_run:
        return True

    for attempt in range(2):
        try:
            ensure_mysql_connection(conn)
            with conn.cursor() as cursor:
                cursor.execute(
                    INSERT_TRACK_GENRE_IF_MISSING_SQL,
                    (
                        spotify_id,
                        spotify_track_id,
                        main_genre,
                        payload,
                        spotify_id,
                        spotify_track_id,
                    ),
                )
                inserted = cursor.rowcount > 0
            conn.commit()
            return inserted
        except pymysql.MySQLError as exc:
            rollback_quietly(conn)
            if attempt == 0 and is_retryable_mysql_error(exc):
                log(
                    f"MySQL connection dropped (code={exc.args[0]}), reconnecting and retrying track write once"
                )
                continue
            raise


def format_progress(index: int, total: int) -> str:
    digits = len(str(max(total, 0)))
    current_width = max(4, digits)
    total_width = max(10, digits)
    return f"{index:0{current_width}d}/{total:0{total_width}d}"


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description=(
            "Backfill nowplaying_spotify_track_genres from the Kaggle track endpoint "
            "served by SPOTIFY_AUDIO_FEATURES_API_URL."
        )
    )
    parser.add_argument(
        "--env-file",
        default=str(repo_root / ".env"),
        help="Optional .env file to load before reading env vars.",
    )
    parser.add_argument("--mysql-uri", default=None, help="Override MYSQL_URI.")
    parser.add_argument(
        "--api-base-url",
        default=None,
        help="Override SPOTIFY_AUDIO_FEATURES_API_URL.",
    )
    parser.add_argument(
        "--http-timeout-seconds",
        type=int,
        default=DEFAULT_HTTP_TIMEOUT_SECONDS,
        help=f"Timeout for each Kaggle HTTP request (default {DEFAULT_HTTP_TIMEOUT_SECONDS}s).",
    )
    parser.add_argument(
        "--dry-run",
        type=int,
        choices=(0, 1),
        default=0,
        help="Use 1 to preview DB changes without writing anything (default 0).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.env_file:
        load_env_file(Path(args.env_file))

    mysql_uri = require_env("MYSQL_URI", args.mysql_uri)
    api_base_url = require_env("SPOTIFY_AUDIO_FEATURES_API_URL", args.api_base_url)
    timeout_seconds = max(1, int(args.http_timeout_seconds))
    dry_run = int(args.dry_run) == 1

    conn = mysql_connect(mysql_uri)
    summary: dict[str, int] = {
        "dry_run": int(dry_run),
        "candidates_selected": 0,
        "inserted_tracks": 0,
        "would_insert_tracks": 0,
        "skipped_existing": 0,
        "skipped_not_found": 0,
        "skipped_http_error": 0,
        "skipped_invalid_response": 0,
        "fetch_errors": 0,
    }

    try:
        if dry_run:
            log("Dry run enabled: DB writes will be skipped")

        rows = select_missing_rows(conn)
        total = len(rows)
        summary["candidates_selected"] = total

        log(f"Selected {total} tracks without a proper genre row")

        for index, row in enumerate(rows, start=1):
            progress = format_progress(index, total)
            spotify_id = int(row["spotify_id"])
            spotify_track_id = str(row["spotify_track_id"] or "").strip()
            artist_title = str(row.get("spotify_artist_title") or "").strip()
            track_title = str(row.get("spotify_track_title") or "").strip()
            display_song = f"{artist_title} - {track_title}".strip(" -")

            result = fetch_kaggle_track_json(
                base_url=api_base_url,
                spotify_track_id=spotify_track_id,
                timeout_seconds=timeout_seconds,
            )
            response = result["response"]
            payload = result["json"]
            elapsed_ms = int(result["elapsed_ms"])
            error = result["error"]

            if error:
                summary["fetch_errors"] += 1
                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"fetch_error | request_ms={elapsed_ms} | error={error}"
                )
                continue

            if response is None:
                summary["fetch_errors"] += 1
                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"fetch_error | request_ms={elapsed_ms}"
                )
                continue

            if response.status_code == 404:
                summary["skipped_not_found"] += 1
                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"not_found | request_ms={elapsed_ms} | http=404"
                )
                continue

            if not response.ok:
                summary["skipped_http_error"] += 1
                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"http_error | request_ms={elapsed_ms} | http={response.status_code}"
                )
                continue

            genres = extract_genres(payload, spotify_track_id)
            if not genres:
                summary["skipped_invalid_response"] += 1
                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"invalid_response | request_ms={elapsed_ms} | http={response.status_code}"
                )
                continue

            inserted = insert_track_genre_if_missing(
                conn,
                spotify_id,
                spotify_track_id,
                genres[0],
                genres[1:],
                dry_run=dry_run,
            )
            if not inserted:
                summary["skipped_existing"] += 1
                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"skipped_existing | request_ms={elapsed_ms} | http={response.status_code}"
                )
                continue

            if dry_run:
                summary["would_insert_tracks"] += 1
            else:
                summary["inserted_tracks"] += 1

            log(
                f"{progress} {display_song} | track_id={spotify_track_id} | "
                f"{'would_insert' if dry_run else 'inserted'} | genre={genres[0]} | "
                f"additional_tags={len(genres[1:])} | "
                f"request_ms={elapsed_ms} | http={response.status_code}"
            )

        log(f"Summary: {json.dumps(summary, sort_keys=True)}")
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
