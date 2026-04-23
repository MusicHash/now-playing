"""Hugging Face dataset: kevinanjalo/spotify_audio_features (parquet shards)."""

from __future__ import annotations

import logging
import os
import re
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import pyarrow as pa
import pyarrow.dataset as pds
import pyarrow.parquet as pq
from fastapi.encoders import jsonable_encoder
from huggingface_hub import hf_hub_download
from huggingface_hub.utils import LocalEntryNotFoundError

logger = logging.getLogger("spotify_audio_features.huggingface")

COLUMNS = [
    "id",
    "name",
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
]

HF_DATASET = "kevinanjalo/spotify_audio_features"
SPOTIFY_ID_RE = re.compile(r"^[0-9A-Za-z]{22}$")

_bounds: dict[int, tuple[str, str] | None] = {}
_result_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()

try:
    _MAX_CACHE = max(0, int(os.environ.get("LOOKUP_CACHE_SIZE", "5000") or 0))
except ValueError:
    _MAX_CACHE = 5000


def _cache_get(tid: str) -> dict[str, Any] | None:
    if _MAX_CACHE <= 0:
        return None
    row = _result_cache.get(tid)
    if row is None:
        return None
    _result_cache.move_to_end(tid)
    return row.copy()


def _cache_put(tid: str, row: dict[str, Any]) -> None:
    if _MAX_CACHE <= 0:
        return
    r = {k: row[k] for k in COLUMNS if k in row}
    _result_cache[tid] = r
    _result_cache.move_to_end(tid)
    while len(_result_cache) > _MAX_CACHE:
        _result_cache.popitem(last=False)


def _stat_pruning_enabled() -> bool:
    return os.environ.get("DISABLE_STAT_PRUNING", "").strip().lower() not in (
        "1",
        "true",
        "yes",
    )


def _hf_token() -> str | None:
    t = os.environ.get("HF_TOKEN", "").strip()
    return t or None


def _shard_filename(shard_index: int) -> str:
    return f"data/spotify_audio_features_{shard_index}.parquet"


def _download_shard(shard_index: int) -> str:
    return hf_hub_download(
        repo_id=HF_DATASET,
        repo_type="dataset",
        filename=_shard_filename(shard_index),
        token=_hf_token(),
    )


def _cached_shard_path(shard_index: int) -> str | None:
    try:
        return hf_hub_download(
            repo_id=HF_DATASET,
            repo_type="dataset",
            filename=_shard_filename(shard_index),
            token=_hf_token(),
            local_files_only=True,
        )
    except LocalEntryNotFoundError:
        return None


def _all_cached_paths() -> list[str] | None:
    paths: list[str] = []
    for i in range(10):
        p = _cached_shard_path(i)
        if p is None:
            return None
        paths.append(p)
    return paths


def _parquet_id_bounds(path: str) -> tuple[str, str] | None:
    try:
        pf = pq.ParquetFile(path)
    except OSError:
        return None
    try:
        col_idx = pf.schema_arrow.names.index("id")
    except ValueError:
        return None
    lo: str | None = None
    hi: str | None = None
    for g in range(pf.num_row_groups):
        col = pf.metadata.row_group(g).column(col_idx)
        st = col.statistics
        if st is None or not st.has_min_max:
            return None
        mn, mx = st.min, st.max
        if mn is None or mx is None:
            return None
        if isinstance(mn, (bytes, bytearray)):
            mn = mn.decode("utf-8", errors="replace")
        if isinstance(mx, (bytes, bytearray)):
            mx = mx.decode("utf-8", errors="replace")
        if not isinstance(mn, str) or not isinstance(mx, str):
            return None
        lo = mn if lo is None else min(lo, mn)
        hi = mx if hi is None else max(hi, mx)
    if lo is None or hi is None:
        return None
    return (lo, hi)


def _ensure_bounds(shard_index: int, path: str) -> None:
    if shard_index in _bounds:
        return
    b = _parquet_id_bounds(path) if _stat_pruning_enabled() else None
    _bounds[shard_index] = b
    if b is not None:
        logger.debug("shard %s id bounds [%s .. %s]", shard_index, b[0], b[1])


def _order_shards(track_id: str) -> list[int]:
    if not _stat_pruning_enabled():
        return list(range(10))
    good: list[int] = []
    bad: list[int] = []
    unknown: list[int] = []
    for i in range(10):
        b = _bounds.get(i)
        if b is None:
            unknown.append(i)
        elif b[0] <= track_id <= b[1]:
            good.append(i)
        else:
            bad.append(i)
    return good + unknown + bad


def _pydict_row_from_table(tab: pa.Table) -> dict[str, Any] | None:
    if tab.num_rows == 0:
        return None
    dct = tab.slice(0, 1).to_pydict()
    out = {c: dct[c][0] for c in COLUMNS if c in dct and len(dct[c]) > 0}
    return jsonable_encoder(out)


def _read_one_id_pyarrow(path: str, track_id: str) -> dict[str, Any] | None:
    try:
        d = pds.dataset(path, format="parquet")
    except (OSError, ValueError, pa.ArrowException):
        return None
    filt = pds.field("id") == track_id
    try:
        scanner = d.scanner(
            filter=filt,
            columns=COLUMNS,
            use_threads=True,
        )
    except (OSError, ValueError, pa.ArrowException):
        return None
    for batch in scanner.to_batches():
        if batch.num_rows == 0:
            continue
        tab = pa.Table.from_batches([batch])
        if tab.num_rows == 0:
            continue
        return _pydict_row_from_table(tab)
    return None


def _lookup_row_raw(track_id: str) -> dict[str, Any] | None:
    cached_paths = _all_cached_paths()
    if cached_paths is not None:
        for i, p in enumerate(cached_paths):
            _ensure_bounds(i, p)
        for i in _order_shards(track_id):
            r = _read_one_id_pyarrow(cached_paths[i], track_id)
            if r:
                return r
        return None

    for i in _order_shards(track_id):
        logger.info("shard %s/9: download or read", i)
        path = _download_shard(i)
        _ensure_bounds(i, path)
        r = _read_one_id_pyarrow(path, track_id)
        if r:
            return r
    return None


def get_track_api_response(
    track_id: str,
) -> tuple[dict[str, Any] | None, int]:
    """
    Return JSON body (including response_time_ms) and elapsed ms, or (None, ms) for 404.
    """
    t0 = time.perf_counter()
    hit = _cache_get(track_id)
    if hit is not None:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {**hit, "response_time_ms": elapsed_ms}, elapsed_ms
    row = _lookup_row_raw(track_id)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    if row is not None:
        _cache_put(track_id, row)
        return {**row, "response_time_ms": elapsed_ms}, elapsed_ms
    return None, elapsed_ms


def prewarm_shards() -> None:
    workers = max(1, min(4, int(os.environ.get("PREWARM_CONCURRENCY", "3"))))

    def one(shard_index: int) -> None:
        try:
            _download_shard(shard_index)
            logger.info("prewarmed shard %s/9", shard_index)
        except Exception as exc:  # noqa: BLE001
            logger.warning("prewarm shard %s failed: %s", shard_index, exc)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, i) for i in range(10)]
        for fut in as_completed(futures):
            fut.result()
