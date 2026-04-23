# Spotify audio features API

[FastAPI](https://fastapi.tiangolo.com/) service with **pluggable data providers**. It serves:

- **Hugging Face** — audio features from [`kevinanjalo/spotify_audio_features`](https://huggingface.co/datasets/kevinanjalo/spotify_audio_features) (parquet shards, PyArrow).
- **Kaggle** — track-level **genres** (and the same per-track audio columns present in the CSV) from [Spotify Tracks Genre Dataset](https://www.kaggle.com/datasets/thedevastator/spotify-tracks-genre-dataset) (`train.csv` via [kagglehub](https://github.com/Kaggle/kagglehub)), plus a **static** sorted list of all genre tags shipped in-repo at `data/kaggle_spotify_genres.json`.

Routes use **`/{provider}/{resource}`** (e.g. `/huggingface/track/{id}`). A legacy `GET /track/{track_id}` handler remains and behaves like the Hugging Face track endpoint for existing clients.

## Requirements

- **Docker** (recommended), or Python **3.14** with dependencies from `requirements.txt`.

## Run with Docker and Make

From this directory:

```bash
# Optional: if the Hub dataset needs authentication
export HF_TOKEN=hf_...

# Optional: Kaggle (first /kaggle/track request downloads ~8MB; see env below)
# export KAGGLE_USERNAME=...  export KAGGLE_KEY=...   # if kagglehub requires it

# Background container on http://localhost:8080
make up
```

Check health and discover providers:

```bash
curl -s http://localhost:8080/health
# {"ok":true}

curl -s http://localhost:8080/providers | jq .
```

**Hugging Face** — audio feature row for a 22-character Spotify track id:

```bash
curl -s "http://localhost:8080/huggingface/track/3n3Ppam7vgaVa1iaRUc9Lp" | jq .
# Legacy (same body shape):
# curl -s "http://localhost:8080/track/3n3Ppam7vgaVa1iaRUc9Lp" | jq .
```

**Kaggle** — static genre vocabulary (114 tags, from the dataset) and a track row with `track_genres` (all labels for that id; the CSV may list the same track in multiple rows with different `track_genre` values):

```bash
curl -s "http://localhost:8080/kaggle/genres" | jq .
curl -s "http://localhost:8080/kaggle/track/5SuOikwiRyPMVoIQDJUgSV" | jq .
```

Other useful targets:

```bash
make help        # list all Makefile targets
make logs-f      # follow container logs
make stop        # stop container
make down        # stop and remove container
make restart     # recreate detached container
```

Override the host port or pass extra Docker flags:

```bash
make up HOST_PORT=9090
make up DOCKER_RUN_EXTRA="--env-file ../.env -v spotify-hf-cache:/root/.cache/huggingface"
```

Foreground run (interactive, container removed on exit):

```bash
make run
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `HF_TOKEN` | Hugging Face token if Hub downloads require auth. |
| `LOOKUP_CACHE_SIZE` | In-memory LRU size for successful Hugging Face lookups (default `5000`; `0` disables). |
| `DISABLE_STAT_PRUNING` | Set to `1` / `true` / `yes` to disable stat-based shard pruning. |
| `PREWARM_CONCURRENCY` | Thread count for HF prewarm (default `3`, capped 1–4). |
| `PREWARM_SHARDS` | Set to `1` / `true` / `yes` to download Hugging Face parquet shards in a background thread at startup. |
| `PREWARM_KAGGLE` | Set to `1` / `true` / `yes` to download and index the Kaggle `train.csv` in a background thread at startup. |
| `KAGGLE_DATASET` | Kaggle dataset slug (default `thedevastator/spotify-tracks-genre-dataset`). |
| `KAGGLE_GENRE_CSV` | If set, path to a local `train.csv` instead of downloading via kagglehub. |
| `LOG_LEVEL` | Python log level (default `INFO`). |

Kaggle’s client cache defaults under `~/.cache/kagglehub` (mount that path in Docker to persist downloads). Inside the image, `HF_HOME` is `/root/.cache/huggingface` (same idea for Hub shards).

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service pointer (`docs`, `providers`). |
| `GET` | `/health` | Liveness: `{"ok": true}`. |
| `GET` | `/providers` | JSON describing each provider and route pattern. |
| `GET` | `/huggingface/track/{track_id}` | Audio feature row; `response_time_ms` on success. **404** if id is valid but missing from the dataset. |
| `GET` | `/kaggle/track/{track_id}` | Track metadata, audio columns from the CSV, and `track_genres` (string array). **404** if not in the Kaggle set. **503** if the CSV could not be loaded. |
| `GET` | `/kaggle/genres` | `{"count", "genres"}` from the static JSON file. |
| `GET` | `/track/{track_id}` | **Legacy** — same as `/huggingface/track/{track_id}`. |

OpenAPI docs are at `/docs` when the server is running.

## Local development (no Docker)

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8080
```

Then use the same `curl` examples against `http://localhost:8080`.
