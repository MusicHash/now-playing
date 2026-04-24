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

DEFAULT_BATCH_SIZE = 50
DEFAULT_BATCH_DELAY_SECONDS = 2.0
DEFAULT_HTTP_TIMEOUT_SECONDS = 20
DEFAULT_AUTOCORRECT = 1
MYSQL_RETRYABLE_ERROR_CODES = {2006, 2013, 2055}

SELECT_CANDIDATE_ROWS_SQL = """
SELECT
    t.`spotify_id`,
    t.`spotify_track_id`,
    t.`spotify_artist_title`,
    t.`spotify_track_title`
FROM `nowplaying_spotify_tracks` t
WHERE t.`spotify_track_id` IS NOT NULL
  AND TRIM(t.`spotify_track_id`) <> ''
  AND t.`spotify_artist_title` IS NOT NULL
  AND TRIM(t.`spotify_artist_title`) <> ''
  AND t.`spotify_track_title` IS NOT NULL
  AND TRIM(t.`spotify_track_title`) <> ''
  AND t.`spotify_id` > %s
  AND NOT EXISTS (
        SELECT 1
        FROM `nowplaying_spotify_track_genres` g
        WHERE g.`spotify_id` = t.`spotify_id`
           OR g.`spotify_track_id` = t.`spotify_track_id`
  )
ORDER BY t.`spotify_id`
LIMIT %s
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

GENRE_ALIASES = {
    "alt rock": "alternative-rock",
    "alternative rock": "alternative-rock",
    "indie rock": "alternative-rock",
    "alternative rnb": "alternative-r&b",
    "hip hop": "hip-hop",
    "hiphop": "hip-hop",
    "r-n-b": "r&b",
    "hebrew": "israeli",
    "israel": "israeli",
    "rhythm and blues": "r&b",
    "rock and roll": "rock-n-roll",
    "synthpop": "synth-pop",
}


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


def load_valid_genres(path: Path) -> set[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise TypeError(f"{path} must contain a JSON array")

    genres = {str(item).strip() for item in payload if str(item).strip()}
    genres.add("alternative-rock")
    return genres


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


def select_candidate_rows(conn, last_spotify_id: int, batch_size: int) -> list[dict[str, Any]]:
    return mysql_execute(
        conn,
        SELECT_CANDIDATE_ROWS_SQL,
        (last_spotify_id, batch_size),
        fetchall=True,
    )


def normalize_tag(tag_name: Any, valid_genres: set[str]) -> str:
    raw = str(tag_name or "").strip().lower()
    spaced = " ".join(raw.replace("/", " ").replace("-", " ").split())
    hyphenated = spaced.replace(" ", "-")

    for candidate in (raw, spaced, hyphenated):
        aliased = GENRE_ALIASES.get(candidate)
        if aliased:
            return aliased

    for candidate in (raw, hyphenated, spaced):
        if candidate in valid_genres:
            return candidate

    return hyphenated


def extract_valid_tags(tags: Any, valid_genres: set[str]) -> list[str]:
    if not isinstance(tags, list):
        return []

    matched: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        if not isinstance(tag, dict):
            continue
        normalized = normalize_tag(tag.get("name"), valid_genres)
        if normalized in valid_genres and normalized not in seen:
            matched.append(normalized)
            seen.add(normalized)
    return matched


def fetch_lastfm_payload(
    *,
    api_key: str,
    method: str,
    artist: str,
    track: Optional[str],
    timeout_seconds: int,
    autocorrect: int,
) -> dict[str, Any]:
    params = {
        "method": method,
        "artist": artist,
        "api_key": api_key,
        "format": "json",
        "autocorrect": autocorrect,
    }
    if track is not None:
        params["track"] = track

    started_at = time.perf_counter()
    try:
        response = requests.get(
            "http://ws.audioscrobbler.com/2.0/",
            params=params,
            timeout=timeout_seconds,
        )
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    except requests.RequestException as exc:
        return {
            "ok": False,
            "elapsed_ms": int((time.perf_counter() - started_at) * 1000),
            "http_status": None,
            "payload": None,
            "transport_error": str(exc),
        }

    try:
        payload = response.json()
    except ValueError:
        payload = None

    return {
        "ok": response.ok,
        "elapsed_ms": elapsed_ms,
        "http_status": response.status_code,
        "payload": payload,
        "transport_error": None,
    }


def get_genre_details(
    *,
    api_key: str,
    artist: str,
    track: str,
    timeout_seconds: int,
    autocorrect: int,
    valid_genres: set[str],
) -> dict[str, Any]:
    track_result = fetch_lastfm_payload(
        api_key=api_key,
        method="track.gettoptags",
        artist=artist,
        track=track,
        timeout_seconds=timeout_seconds,
        autocorrect=autocorrect,
    )
    if track_result["transport_error"] or not track_result["ok"]:
        return {
            "status": "fetch_error",
            "source": "track",
            "main_genre": None,
            "additional_tags": [],
            "elapsed_ms": track_result["elapsed_ms"],
            "http_status": track_result["http_status"],
            "error": track_result["transport_error"] or f"http_{track_result['http_status']}",
        }

    track_payload = track_result["payload"] if isinstance(track_result["payload"], dict) else {}
    track_tags = extract_valid_tags(track_payload.get("toptags", {}).get("tag", []), valid_genres)
    if track_tags:
        return {
            "status": "ok",
            "source": "track",
            "main_genre": track_tags[0],
            "additional_tags": track_tags[1:],
            "elapsed_ms": track_result["elapsed_ms"],
            "http_status": track_result["http_status"],
            "error": None,
        }

    artist_result = fetch_lastfm_payload(
        api_key=api_key,
        method="artist.gettoptags",
        artist=artist,
        track=None,
        timeout_seconds=timeout_seconds,
        autocorrect=autocorrect,
    )
    total_elapsed_ms = track_result["elapsed_ms"] + artist_result["elapsed_ms"]
    if artist_result["transport_error"] or not artist_result["ok"]:
        return {
            "status": "fetch_error",
            "source": "artist",
            "main_genre": None,
            "additional_tags": [],
            "elapsed_ms": total_elapsed_ms,
            "http_status": artist_result["http_status"],
            "error": artist_result["transport_error"] or f"http_{artist_result['http_status']}",
        }

    artist_payload = artist_result["payload"] if isinstance(artist_result["payload"], dict) else {}
    artist_tags = extract_valid_tags(artist_payload.get("toptags", {}).get("tag", []), valid_genres)
    if artist_tags:
        return {
            "status": "ok",
            "source": "artist",
            "main_genre": artist_tags[0],
            "additional_tags": artist_tags[1:],
            "elapsed_ms": total_elapsed_ms,
            "http_status": artist_result["http_status"],
            "error": None,
        }

    return {
        "status": "ok",
        "source": "none",
        "main_genre": None,
        "additional_tags": [],
        "elapsed_ms": total_elapsed_ms,
        "http_status": artist_result["http_status"],
        "error": None,
    }


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
    total_width = max(4, digits)
    return f"{index:0{current_width}d}/{total:0{total_width}d}"


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description=(
            "Backfill nowplaying_spotify_track_genres from Last.fm, storing one main genre "
            "plus a JSON array of additional normalized tags."
        )
    )
    parser.add_argument(
        "--env-file",
        default=str(repo_root / ".env"),
        help="Optional .env file to load before reading env vars.",
    )
    parser.add_argument("--mysql-uri", default=None, help="Override MYSQL_URI.")
    parser.add_argument("--lastfm-api-key", default=None, help="Override LASTFM_API_KEY.")
    parser.add_argument(
        "--valid-genres-file",
        default=str(repo_root / "server" / "config" / "spotify_genres.json"),
        help="JSON file containing the canonical genre list.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of tracks to process per batch (default {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--delay-between-batches-seconds",
        type=float,
        default=DEFAULT_BATCH_DELAY_SECONDS,
        help=f"Sleep between batches to reduce API pressure (default {DEFAULT_BATCH_DELAY_SECONDS}s).",
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=0,
        help="Optional batch limit. Use 0 to process until exhaustion.",
    )
    parser.add_argument(
        "--start-after-spotify-id",
        type=int,
        default=0,
        help="Resume from rows with spotify_id greater than this value.",
    )
    parser.add_argument(
        "--http-timeout-seconds",
        type=int,
        default=DEFAULT_HTTP_TIMEOUT_SECONDS,
        help=f"Timeout for each Last.fm request (default {DEFAULT_HTTP_TIMEOUT_SECONDS}s).",
    )
    parser.add_argument(
        "--autocorrect",
        type=int,
        choices=(0, 1),
        default=DEFAULT_AUTOCORRECT,
        help=f"Pass Last.fm autocorrect=0|1 (default {DEFAULT_AUTOCORRECT}).",
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
    lastfm_api_key = require_env("LASTFM_API_KEY", args.lastfm_api_key)
    valid_genres = load_valid_genres(Path(args.valid_genres_file))
    batch_size = max(1, int(args.batch_size))
    batch_delay_seconds = max(0.0, float(args.delay_between_batches_seconds))
    max_batches = max(0, int(args.max_batches))
    timeout_seconds = max(1, int(args.http_timeout_seconds))
    last_spotify_id = max(0, int(args.start_after_spotify_id))
    dry_run = int(args.dry_run) == 1

    conn = mysql_connect(mysql_uri)
    summary: dict[str, int] = {
        "dry_run": int(dry_run),
        "batches_processed": 0,
        "candidates_selected": 0,
        "inserted_tracks": 0,
        "would_insert_tracks": 0,
        "skipped_existing": 0,
        "track_source_matches": 0,
        "artist_source_matches": 0,
        "unknown_tracks": 0,
        "fetch_errors": 0,
    }

    try:
        if dry_run:
            log("Dry run enabled: DB writes will be skipped")

        while True:
            if max_batches and summary["batches_processed"] >= max_batches:
                break

            rows = select_candidate_rows(conn, last_spotify_id, batch_size)
            if not rows:
                break

            summary["batches_processed"] += 1
            summary["candidates_selected"] += len(rows)
            batch_no = summary["batches_processed"]
            log(
                f"Batch {batch_no}: selected {len(rows)} candidates after spotify_id={last_spotify_id}"
            )

            for index, row in enumerate(rows, start=1):
                spotify_id = int(row["spotify_id"])
                spotify_track_id = str(row["spotify_track_id"] or "").strip()
                artist_title = str(row["spotify_artist_title"] or "").strip()
                track_title = str(row["spotify_track_title"] or "").strip()
                progress = format_progress(index, len(rows))
                display_song = f"{artist_title} - {track_title}".strip(" -")

                details = get_genre_details(
                    api_key=lastfm_api_key,
                    artist=artist_title,
                    track=track_title,
                    timeout_seconds=timeout_seconds,
                    autocorrect=args.autocorrect,
                    valid_genres=valid_genres,
                )

                if details["status"] != "ok":
                    summary["fetch_errors"] += 1
                    log(
                        f"{progress} {display_song} | track_id={spotify_track_id} | "
                        f"fetch_error | request_ms={details['elapsed_ms']} | error={details['error']}"
                    )
                    last_spotify_id = spotify_id
                    continue

                if details["main_genre"] is None:
                    summary["unknown_tracks"] += 1
                    log(
                        f"{progress} {display_song} | track_id={spotify_track_id} | "
                        f"no_genre_match | source={details['source']} | request_ms={details['elapsed_ms']}"
                    )
                    last_spotify_id = spotify_id
                    continue

                inserted = insert_track_genre_if_missing(
                    conn,
                    spotify_id=spotify_id,
                    spotify_track_id=spotify_track_id,
                    main_genre=str(details["main_genre"]),
                    additional_tags=list(details["additional_tags"]),
                    dry_run=dry_run,
                )
                if not inserted:
                    summary["skipped_existing"] += 1
                    log(
                        f"{progress} {display_song} | track_id={spotify_track_id} | "
                        f"skipped_existing | source={details['source']} | request_ms={details['elapsed_ms']}"
                    )
                    last_spotify_id = spotify_id
                    continue

                if dry_run:
                    summary["would_insert_tracks"] += 1
                else:
                    summary["inserted_tracks"] += 1

                if details["source"] == "track":
                    summary["track_source_matches"] += 1
                elif details["source"] == "artist":
                    summary["artist_source_matches"] += 1
                else:
                    summary["unknown_tracks"] += 1

                log(
                    f"{progress} {display_song} | track_id={spotify_track_id} | "
                    f"{'would_insert' if dry_run else 'inserted'} | genre={details['main_genre']} | "
                    f"additional_tags={len(details['additional_tags'])} | "
                    f"source={details['source']} | request_ms={details['elapsed_ms']}"
                )
                last_spotify_id = spotify_id

            if batch_delay_seconds > 0:
                log(f"Sleeping {batch_delay_seconds:.1f}s before next batch")
                time.sleep(batch_delay_seconds)

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
