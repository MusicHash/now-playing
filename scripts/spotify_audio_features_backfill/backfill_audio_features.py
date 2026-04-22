#!/usr/bin/env python3
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterator, Optional
from urllib.parse import parse_qs, unquote, urlparse

import pymysql
import requests

DEFAULT_LIMIT = 25
MAX_LIMIT = 500
DEFAULT_MAX_BATCHES = 1
DEFAULT_HTTP_TIMEOUT_SECONDS = 120
DEFAULT_CONCURRENCY = 1
MAX_CONCURRENCY = 32

SELECT_MISSING_ROWS_SQL = """
SELECT
    t.`spotify_id`,
    t.`spotify_track_id`,
    t.`spotify_artist_title`,
    t.`spotify_track_title`
FROM `nowplaying_spotify_tracks` t
LEFT JOIN `nowplaying_spotify_track_audio_features` a ON a.`spotify_id` = t.`spotify_id`
LEFT JOIN `tmp_nowplaying_spotify_track_audio_features_404` n ON n.`spotify_id` = t.`spotify_id`
WHERE a.`spotify_id` IS NULL
  AND n.`spotify_id` IS NULL
  AND t.`spotify_id` > %s
ORDER BY t.`spotify_id`
LIMIT %s
""".strip()

UPSERT_SQL = """
INSERT INTO `nowplaying_spotify_track_audio_features`
(`spotify_id`, `spotify_track_id`, `popularity`, `null_response`, `duration_ms`, `time_signature`, `key`, `mode`,
 `tempo`, `danceability`, `energy`, `loudness`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
  `spotify_track_id` = VALUES(`spotify_track_id`),
  `popularity` = VALUES(`popularity`),
  `null_response` = VALUES(`null_response`),
  `duration_ms` = VALUES(`duration_ms`),
  `time_signature` = VALUES(`time_signature`),
  `key` = VALUES(`key`),
  `mode` = VALUES(`mode`),
  `tempo` = VALUES(`tempo`),
  `danceability` = VALUES(`danceability`),
  `energy` = VALUES(`energy`),
  `loudness` = VALUES(`loudness`),
  `speechiness` = VALUES(`speechiness`),
  `acousticness` = VALUES(`acousticness`),
  `instrumentalness` = VALUES(`instrumentalness`),
  `liveness` = VALUES(`liveness`),
  `valence` = VALUES(`valence`)
""".strip()

INSERT_404_SQL = """
INSERT INTO `tmp_nowplaying_spotify_track_audio_features_404`
(`spotify_id`, `spotify_track_id`, `notfound_timestamp`)
VALUES (%s, %s, %s)
ON DUPLICATE KEY UPDATE
  `spotify_track_id` = VALUES(`spotify_track_id`),
  `notfound_timestamp` = VALUES(`notfound_timestamp`)
""".strip()

REQUIRED_API_FIELDS = (
    "popularity",
    "null_response",
    "duration_ms",
    "time_signature",
    "key",
    "mode",
    "tempo",
    "danceability",
    "energy",
    "loudness",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
)


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


def select_missing_rows(conn, last_spotify_id: int, limit: int) -> list[Dict[str, Any]]:
    with conn.cursor() as cursor:
        cursor.execute(SELECT_MISSING_ROWS_SQL, (last_spotify_id, limit))
        return list(cursor.fetchall())


def upsert_params_from_api_body(body: Any, spotify_id: int, spotify_track_id: str) -> Optional[list[float]]:
    if not isinstance(body, dict):
        return None

    for key in REQUIRED_API_FIELDS:
        if body.get(key) is None:
            return None

    api_id = body.get("id")
    if isinstance(api_id, str) and api_id != spotify_track_id:
        return None

    popularity = max(0, min(100, round(float(body["popularity"]))))
    null_response = 1 if int(body["null_response"]) != 0 else 0

    params = [
        spotify_id,
        spotify_track_id,
        popularity,
        null_response,
        round(float(body["duration_ms"])),
        round(float(body["time_signature"])),
        round(float(body["key"])),
        round(float(body["mode"])),
        float(body["tempo"]),
        float(body["danceability"]),
        float(body["energy"]),
        float(body["loudness"]),
        float(body["speechiness"]),
        float(body["acousticness"]),
        float(body["instrumentalness"]),
        float(body["liveness"]),
        float(body["valence"]),
    ]

    for value in params[2:]:
        if not isinstance(value, (int, float)):
            return None
        if value != value or value in (float("inf"), float("-inf")):
            return None

    return params


def fetch_audio_features_json(
    base_url: str,
    spotify_track_id: str,
    timeout_seconds: int,
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/track/{spotify_track_id}"
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


def iter_fetch_results(
    rows: list[Dict[str, Any]],
    base_url: str,
    timeout_seconds: int,
    concurrency: int,
) -> Iterator[tuple[int, Dict[str, Any]]]:

    def fetch_one(index: int, row: Dict[str, Any]) -> tuple[int, Dict[str, Any]]:
        spotify_track_id = str(row["spotify_track_id"] or "").strip()
        result = fetch_audio_features_json(
            base_url=base_url,
            spotify_track_id=spotify_track_id,
            timeout_seconds=timeout_seconds,
        )
        return index, result

    worker_count = max(1, min(MAX_CONCURRENCY, int(concurrency)))
    if worker_count == 1:
        for index, row in enumerate(rows):
            yield fetch_one(index, row)
        return

    for start in range(0, len(rows), worker_count):
        row_window = rows[start : start + worker_count]
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = [executor.submit(fetch_one, start + offset, row) for offset, row in enumerate(row_window)]
            for future in as_completed(futures):
                yield future.result()


def persist_upsert(conn, params: list[float]) -> None:
    with conn.cursor() as cursor:
        cursor.execute(UPSERT_SQL, params)
    conn.commit()


def persist_not_found(conn, spotify_id: int, spotify_track_id: str) -> None:
    timestamp = int(time.time())
    with conn.cursor() as cursor:
        cursor.execute(INSERT_404_SQL, (spotify_id, spotify_track_id, timestamp))
    conn.commit()


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description=(
            "Backfill nowplaying_spotify_track_audio_features from the "
            "SPOTIFY_AUDIO_FEATURES_API_URL sidecar using the repo .env."
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
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Tracks to select per batch (default {DEFAULT_LIMIT}, max {MAX_LIMIT}).",
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=DEFAULT_MAX_BATCHES,
        help=f"How many batches to process in one run (default {DEFAULT_MAX_BATCHES}).",
    )
    parser.add_argument(
        "--run-until-empty",
        action="store_true",
        help="Keep fetching next batches until no more candidates remain.",
    )
    parser.add_argument(
        "--http-timeout-seconds",
        type=int,
        default=DEFAULT_HTTP_TIMEOUT_SECONDS,
        help=f"Timeout for each audio-features HTTP request (default {DEFAULT_HTTP_TIMEOUT_SECONDS}s).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        help=(
            f"How many audio-features HTTP requests to run in parallel per batch "
            f"(default {DEFAULT_CONCURRENCY}, max {MAX_CONCURRENCY})."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.env_file:
        load_env_file(Path(args.env_file))

    mysql_uri = require_env("MYSQL_URI", args.mysql_uri)
    api_base_url = require_env("SPOTIFY_AUDIO_FEATURES_API_URL", args.api_base_url)

    limit = max(1, min(MAX_LIMIT, int(args.limit)))
    max_batches = max(1, int(args.max_batches))
    timeout_seconds = max(1, int(args.http_timeout_seconds))
    concurrency = max(1, min(MAX_CONCURRENCY, int(args.concurrency)))

    conn = mysql_connect(mysql_uri)

    summary: Dict[str, Any] = {
        "requested_limit": limit,
        "concurrency": concurrency,
        "batches_attempted": 0,
        "batches_with_candidates": 0,
        "candidates_selected": 0,
        "upserted": 0,
        "skipped_not_found": 0,
        "skipped_http_error": 0,
        "skipped_invalid_fields": 0,
        "fetch_errors": 0,
        "last_spotify_id_seen": 0,
    }

    last_spotify_id = 0

    try:
        while True:
            if not args.run_until_empty and summary["batches_attempted"] >= max_batches:
                break

            rows = select_missing_rows(conn, last_spotify_id, limit)
            summary["batches_attempted"] += 1

            if not rows:
                log(
                    f"Batch {summary['batches_attempted']}: selected=0; no more candidates after spotify_id>{last_spotify_id}"
                )
                break

            summary["batches_with_candidates"] += 1
            summary["candidates_selected"] += len(rows)
            last_spotify_id = int(rows[-1]["spotify_id"])
            summary["last_spotify_id_seen"] = last_spotify_id

            log(
                f"Batch {summary['batches_attempted']}: selected={len(rows)} "
                f"(limit={limit}, concurrency={concurrency}, start_after_spotify_id={int(rows[0]['spotify_id']) - 1})"
            )

            for raw_index, result in iter_fetch_results(
                rows=rows,
                base_url=api_base_url,
                timeout_seconds=timeout_seconds,
                concurrency=concurrency,
            ):
                index = raw_index + 1
                row = rows[raw_index]
                spotify_id = int(row["spotify_id"])
                spotify_track_id = str(row["spotify_track_id"] or "").strip()
                artist_title = str(row.get("spotify_artist_title") or "").strip()
                track_title = str(row.get("spotify_track_title") or "").strip()
                display_song = f"{artist_title} - {track_title}".strip(" -")

                response = result["response"]
                payload = result["json"]
                elapsed_ms = int(result["elapsed_ms"])
                error = result["error"]

                if error:
                    summary["fetch_errors"] += 1
                    log(
                        f"[{index}/{len(rows)}] {display_song} | track_id={spotify_track_id} | "
                        f"fetch_error | request_ms={elapsed_ms} | error={error}"
                    )
                    continue

                if response is None:
                    summary["fetch_errors"] += 1
                    log(
                        f"[{index}/{len(rows)}] {display_song} | track_id={spotify_track_id} | "
                        f"fetch_error | request_ms={elapsed_ms}"
                    )
                    continue

                if response.status_code == 404:
                    persist_not_found(conn, spotify_id, spotify_track_id)
                    summary["skipped_not_found"] += 1
                    log(
                        f"[{index}/{len(rows)}] {display_song} | track_id={spotify_track_id} | "
                        f"not_found | request_ms={elapsed_ms} | http=404"
                    )
                    continue

                if not response.ok:
                    summary["skipped_http_error"] += 1
                    log(
                        f"[{index}/{len(rows)}] {display_song} | track_id={spotify_track_id} | "
                        f"http_error | request_ms={elapsed_ms} | http={response.status_code}"
                    )
                    continue

                params = upsert_params_from_api_body(payload, spotify_id, spotify_track_id)
                if not params:
                    summary["skipped_invalid_fields"] += 1
                    log(
                        f"[{index}/{len(rows)}] {display_song} | track_id={spotify_track_id} | "
                        f"invalid_response | request_ms={elapsed_ms} | http={response.status_code}"
                    )
                    continue

                persist_upsert(conn, params)
                summary["upserted"] += 1

                api_response_ms = payload.get("response_time_ms") if isinstance(payload, dict) else None
                extra = (
                    f" | api_response_ms={int(api_response_ms)}"
                    if isinstance(api_response_ms, (int, float))
                    else ""
                )
                log(
                    f"[{index}/{len(rows)}] {display_song} | track_id={spotify_track_id} | "
                    f"upserted | request_ms={elapsed_ms}{extra} | http={response.status_code}"
                )

            if args.run_until_empty:
                continue

            if summary["batches_attempted"] >= max_batches:
                break

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
