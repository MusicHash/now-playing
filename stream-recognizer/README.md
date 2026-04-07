# stream-recognizer

Standalone process that polls configured online radio streams: **capture → Chromaprint (`fpcalc`) for dedup** → **ACRCloud** (default), **Shazam**, and/or **AcoustID** in **`AUDIO_RECOGNITION_ORDER`** (default `acrcloud,acoustid`). Results are stored in **Redis** using the shared [`server/src/utils/redis_wrapper.js`](../server/src/utils/redis_wrapper.js). An HTTP API returns the last cached row per station.

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
- **ACRCloud** — [Console](https://console.acrcloud.com/) project with **host** (identify endpoint), **access key**, and **access secret** (`ACRCLOUD_HOST`, `ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET`). Used first by default for audio ID.
- **AcoustID application key** (optional fallback) — register an app at [acoustid.org/new-application](https://acoustid.org/new-application) and put that **client** key in `ACOUSTID_CLIENT_KEY`. The key shown at [acoustid.org/api-key](https://acoustid.org/api-key) is your **user** key (for fingerprint *submissions* only); it is **not** valid for the `client` parameter on lookup and returns error code 4. Commercial [AcoustID.biz](https://acoustid.biz/) plans still use this application key with `https://api.acoustid.org/v2/lookup`.

## Setup

```bash
cd stream-recognizer
cp .env.example .env
# Edit .env: REDIS_URI, ACRCLOUD_* (recommended), ACOUSTID_CLIENT_KEY (fallback), HTTP_PORT
# Edit config/stations.json: set streamUrl, id, enabled: true
npm install
npm start
```

## Troubleshooting

### Process “hangs” or no logs after start

Startup **binary checks** run **after** the HTTP server logs `listening` (they no longer block the first log line). If a tick seems stuck, check for **`station tick: start`** then **`ffmpeg capture`**: **ffmpeg** aborts after roughly `CAPTURE_SECONDS` + `FFMPEG_CAPTURE_OVERHEAD_MS` (default ~55s for 10s capture), configurable via **`FFMPEG_CAPTURE_TIMEOUT_MS`**.

CDN **DASH / `.livx`** URLs may be slow or unsuitable for a simple `ffmpeg -i … -t 10` pull. Prefer a direct **Icecast/Shoutcast MP3/AAC** stream URL when possible.

### Audio recognition: no match — inspect the capture

Logs include `capturePath`, `fingerprintPrefix`, and **`order`** (provider list). The temp capture is deleted after each tick unless **`DEBUG_CAPTURE_DIR`** is set and **`DEBUG_CAPTURE_ENABLED`** is not disabled (`1` by default). Copies use `{timestamp}-{stationId}-{tickId}-{label}.wav` (UTC ISO time with `:` / `.` replaced for filenames): `no-match` when every provider fails; pre-recognition empty skips use `detected-empty-*`. Successful IDs are copied **only** when **Shazam ran and missed** and a **later** provider in `AUDIO_RECOGNITION_ORDER` matched (label `saved-<provider>-after-shazam-miss`). A Shazam win is never copied to `DEBUG_CAPTURE_DIR`.

### `invalid API key` (HTTP 400, AcoustID error code 4)

You are almost certainly using the **user** API key from your AcoustID profile. For **lookup**, AcoustID expects the **application** key: create an application at [acoustid.org/new-application](https://acoustid.org/new-application) and copy that key into `ACOUSTID_CLIENT_KEY`. Trim whitespace; you can also try `ACOUSTID_APPLICATION_KEY` if another tool set that name.

## Configuration

| Env | Purpose |
|-----|---------|
| `REDIS_URI` | Redis connection string |
| `HTTP_PORT` | API port (default `3847`) |
| `REDIS_KEY_PREFIX` | Key prefix (default `stream-recognizer:v1`) |
| `POLL_INTERVAL_SEC` | Default poll interval in seconds when station omits `intervalMs` (default `120`) |
| `ACRCLOUD_HOST` | Identify host — **EU:** `identify-eu-west-1.acrcloud.com`, **US:** `identify-us-west-2.acrcloud.com` (must match your console project region) |
| `ACRCLOUD_ACCESS_KEY` | ACRCloud access key |
| `ACRCLOUD_ACCESS_SECRET` | ACRCloud access secret |
| `ACRCLOUD_SAMPLE_RATE` | WAV sample rate sent to SDK (default `16000`, matching capture) |
| `AUDIO_RECOGNITION_ORDER` | Comma-separated: `acrcloud`, `shazam`, `acoustid` (default **`acrcloud,acoustid`**) |
| `ACOUSTID_CLIENT_KEY` | Application client key from [new-application](https://acoustid.org/new-application) (aliases: `ACOUSTID_APPLICATION_KEY`, `ACOUSTID_API_KEY`) |
| `ACOUSTID_DEBUG_RESPONSE` | Set `1` to log a truncated raw AcoustID JSON body when matches exist but title/artist could not be parsed |
| `ACOUSTID_DURATION_SPREAD` | `0`–`5` (default `1`): retry lookup with other integer durations around fpcalc’s value (AcoustID is duration-sensitive) |
| `ACOUSTID_RETRY_DELAY_MS` | Delay between duration retries (default `350` ms) |
| `CAPTURE_SECONDS` | Recording length (default `10`) |
| `RMS_SILENCE_DB` | Silence gate (default `-45`) |
| `VAD_ENABLED` | `1`/`0` — speech-heavy heuristic to skip music ID during talk |
| `VAD_SPEECH_RATIO_SKIP` | Fraction of “speech-like” frames above which clip is skipped |
| `STATIONS_CONFIG` | Optional path to stations JSON (default `config/stations.json`) |
| `CORS_ORIGIN` | If set, enables CORS for that origin |
| `DEBUG_CAPTURE_DIR` | If set, copy captures here for no-match / empty skips, and for successful ID only when Shazam missed and a later provider matched (see section above) |
| `DEBUG_CAPTURE_ENABLED` | `1`/`0` — enable WAV copies to `DEBUG_CAPTURE_DIR` (default `1` when unset) |

Stations file: array of `{ "id", "streamUrl", "enabled", "intervalMs", "vadAggressive", "rmsSilenceDb" }`.

## HTTP API

- `GET /health` — process up; Redis status (`up`/`down`).
- `GET /stations` — each station includes config (`id`, `enabled`, `intervalMs`, `streamUrl`) plus **`recognition`** (last saved track payload from Redis, or `null`) and **`lastRun`** (status of the most recent tick: `at`, `tickId`, `outcome`, and optional fields such as `error`, `priorSteps`, `provider`).
- `GET /stations/:id` — `{ id, recognition, lastRun }` for one station (`404` if the Redis key was never written).

Per station, Redis stores `{ recognition, lastRun }`. **`recognition`** holds the track fields: `artist`, `title`, `source` (`acrcloud` \| `shazam` \| `acoustid`), `provider`, `updatedAt` (ISO), Chromaprint `fingerprint`, and optional `acrid`, `shazamKey`. Legacy rows may still include `metadata` / `icy` or `rawTitle` from older versions until rewritten. **`lastRun`** is updated every tick (e.g. `saved_audio`, `no_match`, `skipped_silence`, `error`).

## Behaviour

1. **Audio** — capture (default 10s), decode to 16 kHz mono PCM, apply **RMS silence** and **speech-heavy** heuristics; skip recognition if likely silence or talk.
2. **Chromaprint** — if fingerprint equals the last stored fingerprint, skip recognition APIs and Redis.
3. **ACRCloud / Shazam / AcoustID** — in **`AUDIO_RECOGNITION_ORDER`**; first match wins.
4. If normalized artist/title matches Redis, skip write (preserves original `updatedAt`).

## Adding another recognition provider

Implement a new module under `src/providers/` and extend `src/pipeline/orchestrator.js` (or introduce a small registry) to call it in order with the other audio providers. Keep HTTP handlers read-only against Redis.
