import json
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from huggingface_hub.utils import HfHubHTTPError

from providers.huggingface_audio import get_track_api_response as hf_get_track
from providers.huggingface_audio import prewarm_shards
from providers.huggingface_audio import SPOTIFY_ID_RE
from providers.kaggle_genre import get_track_api_response as kaggle_get_track
from providers.kaggle_genre import load_static_genre_list
from providers.kaggle_genre import prewarm_index

logger = logging.getLogger("spotify_audio_features")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if os.environ.get("PREWARM_SHARDS", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        threading.Thread(target=prewarm_shards, daemon=True).start()
    if os.environ.get("PREWARM_KAGGLE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        prewarm_index()
    yield


app = FastAPI(
    title="Spotify data API (multi-provider)",
    version="0.2.0",
    lifespan=lifespan,
)

_TRACK_ID_ERR = "Expected a 22-character Spotify track id (letters and digits)."


def _require_spotify_id(track_id: str) -> None:
    if not SPOTIFY_ID_RE.match(track_id):
        raise HTTPException(status_code=400, detail=_TRACK_ID_ERR)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/")
def root():
    return {
        "service": "spotify-audio-features-api",
        "docs": "/docs",
        "providers": "/providers",
    }


@app.get("/providers")
def list_providers():
    return {
        "huggingface": {
            "description": "Audio features (parquet) from kevinanjalo/spotify_audio_features",
            "routes": {
                "track": "/huggingface/track/{track_id}",
            },
        },
        "kaggle": {
            "description": "Genres and labels from thedevastator/spotify-tracks-genre-dataset (train.csv)",
            "routes": {
                "track": "/kaggle/track/{track_id}",
                "genres": "/kaggle/genres",
            },
        },
    }


@app.get("/huggingface/track/{track_id}")
def huggingface_track(track_id: str):
    _require_spotify_id(track_id)
    try:
        row, _elapsed = hf_get_track(track_id)
    except HfHubHTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Hugging Face Hub error (check HF_TOKEN if the dataset requires auth): {exc}",
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Error reading dataset files: {exc}",
        ) from exc
    if row is None:
        return JSONResponse(
            status_code=404,
            content={
                "detail": "Track id not found.",
                "response_time_ms": _elapsed,
            },
        )
    return row


@app.get("/kaggle/track/{track_id}")
def kaggle_track(track_id: str):
    _require_spotify_id(track_id)
    body, elapsed_ms, err = kaggle_get_track(track_id)
    if err is not None:
        raise HTTPException(
            status_code=503,
            detail=f"Kaggle dataset unavailable: {err}",
        )
    if body is None:
        return JSONResponse(
            status_code=404,
            content={
                "detail": "Track id not in genre dataset.",
                "response_time_ms": elapsed_ms,
            },
        )
    return body


@app.get("/kaggle/genres")
def kaggle_genres():
    try:
        genres = load_static_genre_list()
    except (OSError, json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read static genre list: {exc}",
        ) from exc
    return {"count": len(genres), "genres": genres}


# --- legacy and compatibility ---


@app.get("/track/{track_id}")
def track_legacy(track_id: str):
    """Same as /huggingface/track/{track_id} (kept for existing clients)."""
    return huggingface_track(track_id)
