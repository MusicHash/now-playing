"""Kaggle dataset: thedevastator/spotify-tracks-genre-dataset (train.csv via kagglehub)."""

from __future__ import annotations

import csv
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import kagglehub

logger = logging.getLogger("spotify_audio_features.kaggle_genre")

DEFAULT_KAGGLE_DATASET = "thedevastator/spotify-tracks-genre-dataset"
DEFAULT_CSV_NAME = "train.csv"

# track_id -> full row (string values, json-safe)
_index: dict[str, dict[str, Any]] | None = None
_load_lock = threading.Lock()
_index_error: str | None = None

_KAGGLE_RESPONSE_FIELDS = (
    "track_id",
    "artists",
    "album_name",
    "track_name",
    "popularity",
    "duration_ms",
    "explicit",
    "danceability",
    "energy",
    "key",
    "loudness",
    "mode",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
    "time_signature",
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_static_genre_list() -> list[str]:
    path = _repo_root() / "server" / "config" / "spotify_genres.json"
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise TypeError("spotify_genres.json must be a JSON array of strings")
    return [str(x) for x in data]


def _discover_train_csv(root: str | Path) -> Path:
    root = Path(root)
    if (root / DEFAULT_CSV_NAME).is_file():
        return root / DEFAULT_CSV_NAME
    csvs = sorted(root.glob("**/*.csv"))
    if not csvs:
        raise FileNotFoundError(f"No CSV under Kaggle dataset path: {root}")
    if len(csvs) > 1:
        logger.info("using first CSV in dataset: %s", csvs[0])
    return csvs[0]


def _clean_row_no_genre(row: dict[str, str | None]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for k in _KAGGLE_RESPONSE_FIELDS:
        if k not in row:
            continue
        v = row[k]
        if v is None or v == "":
            continue
        if k == "explicit":
            if isinstance(v, str):
                lv = v.strip().lower()
                clean[k] = lv in ("true", "1", "yes")
            else:
                clean[k] = bool(v)
        else:
            clean[k] = v
    return clean


def _load_train_csv_to_index(csv_path: Path) -> dict[str, dict[str, Any]]:
    """One entry per track_id; the CSV repeats ids with different track_genre (multi-label)."""
    out: dict[str, dict[str, Any]] = {}
    genres: dict[str, set[str]] = {}
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tid = (row.get("track_id") or "").strip()
            if not tid:
                continue
            g = (row.get("track_genre") or "").strip()
            if tid not in out:
                out[tid] = _clean_row_no_genre(row)
                genres[tid] = set()
            if g:
                genres[tid].add(g)
    for tid, gs in genres.items():
        out[tid]["track_genres"] = sorted(gs)
    return out


def _ensure_index_locked() -> None:
    global _index, _index_error
    if _index is not None or _index_error is not None:
        return
    override = os.environ.get("KAGGLE_GENRE_CSV", "").strip()
    ds = os.environ.get("KAGGLE_DATASET", DEFAULT_KAGGLE_DATASET).strip() or DEFAULT_KAGGLE_DATASET
    try:
        if override:
            csv_path = Path(override).expanduser()
            if not csv_path.is_file():
                raise FileNotFoundError(f"KAGGLE_GENRE_CSV is not a file: {csv_path}")
        else:
            root = kagglehub.dataset_download(ds)
            csv_path = _discover_train_csv(root)
        logger.info("loading Kaggle genre CSV: %s", csv_path)
        _index = _load_train_csv_to_index(csv_path)
        logger.info("loaded %s track rows for genre lookup", f"{len(_index):,}")
    except Exception as exc:  # noqa: BLE001
        _index_error = str(exc)
        logger.error("Kaggle genre index load failed: %s", exc)


def ensure_genre_index() -> None:
    """Eagerly load the Kaggle train.csv index (thread-safe)."""
    with _load_lock:
        if _index is not None or _index_error is not None:
            return
        _ensure_index_locked()


def get_track_api_response(
    track_id: str,
) -> tuple[dict[str, Any] | None, int, str | None]:
    """
    Return (body with id + provider metadata + response_time_ms, elapsed_ms, error_detail).
    error_detail is set for load failures (caller maps to 503).
    """
    t0 = time.perf_counter()
    with _load_lock:
        if _index is None and _index_error is None:
            _ensure_index_locked()
        err = _index_error
        idx = _index
    if err is not None:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return None, elapsed_ms, err
    assert idx is not None
    row = idx.get(track_id)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    if row is None:
        return None, elapsed_ms, None
    body = {
        "id": track_id,
        "provider": "kaggle",
        "dataset": os.environ.get("KAGGLE_DATASET", DEFAULT_KAGGLE_DATASET).strip()
        or DEFAULT_KAGGLE_DATASET,
        **{k: v for k, v in row.items() if k not in ("track_id", "track_genre")},
        "response_time_ms": elapsed_ms,
    }
    return body, elapsed_ms, None


def prewarm_index() -> None:
    def run() -> None:
        try:
            ensure_genre_index()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Kaggle prewarm failed: %s", exc)

    threading.Thread(target=run, daemon=True).start()
