# stream-recognizer

Standalone process that polls configured online radio streams: **capture → Chromaprint (`fpcalc`) for dedup** → **Shazam** (default) in **`AUDIO_RECOGNITION_ORDER`** (default `shazam`). The pipeline is built so **additional recognition providers** can be wired in without restructuring (see below). Results are stored in **Redis** using the shared [`server/src/utils/redis_wrapper.js`](../server/src/utils/redis_wrapper.js). An HTTP API returns the last cached row per station.

## Requirements

- **Node.js** (same major as the main repo; `--env-file` is used like the server).
- **ffmpeg** and **fpcalc** (Chromaprint) on `PATH`, or set `FFMPEG_BIN` / `FPCALC_BIN` to full paths in `.env`.

### Installing ffmpeg and fpcalc (WSL / Debian / Ubuntu)

```bash
sudo apt update
sudo apt install -y ffmpeg libchromaprint-tools
```

`libchromaprint-tools` provides `/usr/bin/fpcalc`. If the command is still not found, set `FPCALC_BIN=/usr/bin/fpcalc` in `.env`.

On macOS: `brew install ffmpeg chromaprint`.

- **Redis** reachable via `REDIS_URI` (required for persistence).

## Setup

```bash
cd stream-recognizer
cp .env.example .env
# Edit .env: REDIS_URI, HTTP_PORT (optional: HTTP_HOST to bind a specific IP)
# Edit config/stations.json: set streamUrl, id, enabled: true
npm install
npm start
```

## Troubleshooting

### Process “hangs” or no logs after start

Startup **binary checks** run **after** the HTTP server logs `listening` (they no longer block the first log line). If a tick seems stuck, check for **`station tick: start`** then **`ffmpeg capture`**: **ffmpeg** aborts after roughly `CAPTURE_SECONDS` + `FFMPEG_CAPTURE_OVERHEAD_MS` (default ~55s for 10s capture), configurable via **`FFMPEG_CAPTURE_TIMEOUT_MS`**.

CDN **DASH / `.livx`** URLs may be slow or unsuitable for a simple `ffmpeg -i … -t 10` pull. Prefer a direct **Icecast/Shoutcast MP3/AAC** stream URL when possible.

### Audio recognition: no match — inspect the capture

Logs include `capturePath`, `fingerprintPrefix`, and **`order`** (provider list). The temp capture is deleted after each tick unless **`DEBUG_CAPTURE_DIR`** is set and **`DEBUG_CAPTURE_ENABLED`** is not disabled (`1` by default). Copies use `{unixTime}-{stationId}-{tickId}-{label}.wav` (`unixTime` = seconds since Unix epoch): `no-match` when every provider fails; pre-recognition empty skips use `detected-empty-*`. Successful IDs are copied **only** when **Shazam ran and missed** and a **later** provider in `AUDIO_RECOGNITION_ORDER` matched (label `saved-<provider>-after-shazam-miss`). A Shazam win is never copied to `DEBUG_CAPTURE_DIR`.

## Configuration

| Env | Purpose |
|-----|---------|
| `REDIS_URI` | Redis connection string |
| `HTTP_PORT` | API port (default `3847`) |
| `HTTP_HOST` | Optional bind address (e.g. `192.168.1.10`). If unset, listens on all interfaces. |
| `REDIS_KEY_PREFIX` | Key prefix (default `stream-recognizer:v1`) |
| `POLL_INTERVAL_SEC` | Default poll interval in seconds when station omits `intervalMs` (default `120`) |
| `AUDIO_RECOGNITION_ORDER` | Comma-separated provider ids (default **`shazam`**). Allowed ids are defined in `getAudioRecognitionOrder()` in `src/config.js`. |
| `CAPTURE_SECONDS` | Recording length (default `10`) |
| `RMS_SILENCE_DB` | Silence gate (default `-45`) |
| `VAD_ENABLED` | `1`/`0` — speech-heavy heuristic to skip music ID during talk |
| `VAD_SPEECH_RATIO_SKIP` | Fraction of “speech-like” frames above which clip is skipped |
| `STATIONS_CONFIG` | Optional path to stations JSON (default `config/stations.json`) |
| `CORS_ORIGIN` | If set, enables CORS for that origin |
| `DEBUG_CAPTURE_DIR` | If set, copy captures here for no-match / empty skips, and for successful ID only when Shazam missed and a later provider matched (see section above) |
| `DEBUG_CAPTURE_ENABLED` | `1`/`0` — enable WAV copies to `DEBUG_CAPTURE_DIR` (default `1` when unset) |

Shazam-specific variables (`SHAZAM_*`, `HTTP_PROXY`) are documented in `.env.example`.

Stations file: array of `{ "id", "streamUrl", "enabled", "intervalMs", "vadAggressive", "rmsSilenceDb" }`.

## HTTP API

- `GET /health` — process up; Redis status (`up`/`down`).
- `GET /stations` — `{ stations: { [key]: { ... } } }`: keys are derived from each station `id` by dropping the substring from the first `-` onward, removing `.`, then replacing any remaining non‑`[a-zA-Z0-9_]` with `_`. Each value includes the real `id` plus config (`enabled`, `intervalMs`, `streamUrl`) and **`recognition`** when a track has been cached.
- `GET /stations/:id` — `{ id, recognition }` for one station (`404` if nothing is cached yet).

Per station, Redis stores **flat recognition JSON**: `artist`, `title`, `source`, `provider`, `updatedAt` (ISO), Chromaprint `fingerprint`, and optional `shazamKey`. Older values may still include legacy fields (`acrid`, other `source` values, `metadata` / `icy` / `rawTitle`) until rewritten. The key is only updated when recognition changes (successful ID and not skipped as duplicate).

## Behaviour

1. **Audio** — capture (default 10s), decode to 16 kHz mono PCM, apply **RMS silence** and **speech-heavy** heuristics; skip recognition if likely silence or talk.
2. **Chromaprint** — if fingerprint equals the last stored fingerprint, skip recognition APIs and Redis.
3. **Recognition providers** — in **`AUDIO_RECOGNITION_ORDER`**; first match wins.
4. If normalized artist/title matches Redis, skip write (preserves original `updatedAt`).

## Adding another recognition provider

1. Add the provider id to the **allowed** set in `getAudioRecognitionOrder()` (`src/config.js`).
2. Implement `src/providers/<id>.js` (see `shazam.js` for the integration pattern).
3. Add an `if (id === '<id>') { ... }` branch in `src/pipeline/orchestrator.js` (same structure as Shazam).
4. Append the id to `PROVIDER_ORDER` in `src/providers/registry.js` (documentation / consistency).

HTTP handlers stay read-only against Redis.
