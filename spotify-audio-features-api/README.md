# Spotify audio features API

Small [FastAPI](https://fastapi.tiangolo.com/) service that looks up Spotify track audio features from the Hugging Face dataset [`kevinanjalo/spotify_audio_features`](https://huggingface.co/datasets/kevinanjalo/spotify_audio_features). Data is read via [PyArrow](https://arrow.apache.org/docs/python/) from cached parquet shards on first request (or optionally prewarmed at startup).

## Requirements

- **Docker** (recommended), or Python **3.14** with dependencies from `requirements.txt`.

## Run with Docker and Make

From this directory:

```bash
# Optional: if the Hub dataset needs authentication
export HF_TOKEN=hf_...

# Background container on http://localhost:8080
make up
```

Check health:

```bash
curl -s http://localhost:8080/health
# {"ok":true}
```

Fetch features for a track (Spotify track IDs are 22 alphanumeric characters):

```bash
curl -s "http://localhost:8080/track/3n3Ppam7vgaVa1iaRUc9Lp" | jq .
```

Example JSON fields include `danceability`, `energy`, `tempo`, `valence`, `loudness`, and `response_time_ms`. A **404** means the id is valid but not present in the dataset.

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
| `HF_TOKEN` | Hugging Face token if downloads require auth. |
| `LOOKUP_CACHE_SIZE` | In-memory LRU size for successful lookups (default `5000`; `0` disables). |
| `DISABLE_STAT_PRUNING` | Set to `1` / `true` / `yes` to disable stat-based pruning when scanning shards. |
| `PREWARM_CONCURRENCY` | Thread count for prewarm (default `3`, capped 1–4). |
| `PREWARM_SHARDS` | Set to `1` / `true` / `yes` to download shards in a background thread at startup. |

Inside the image, `HF_HOME` is `/root/.cache/huggingface` (persist that path with a volume if you want to avoid re-downloading shards).

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness: `{"ok": true}`. |
| `GET` | `/track/{track_id}` | Audio feature row for a 22-character Spotify track id. |

OpenAPI docs are available at `/docs` when the server is running.

## Local development (no Docker)

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8080
```

Then use the same `curl` examples against `http://localhost:8080`.
