# Now Playing

A small dashboard for **radio play logs**. Explore how often tracks and artists show up over time, spot momentum, drill into details, and build playlists when you hook it up to Spotify.

## What’s inside

- **Play metrics** — Charts for plays over time, top tracks and artists, momentum, and drill-downs into specific songs or artists.
- **Generate playlist** — Turn what you’re seeing into playlists (with Spotify wired up).
- **REST API** — The Express server exposes `/api` routes for health, stations, stats, playlists, and more.

The UI is **React** (Vite); the backend is **Node** (Express) with optional **MySQL**, **Redis**, **New Relic** (APM, custom metrics, log forwarding), and **Spotify** integration—configure what you need via a root `.env` file. The **stream-recognizer** workspace uses its own `.env` and `NEW_RELIC_APP_NAME` (default `stream-recognizer`); see [stream-recognizer/README.md](stream-recognizer/README.md).

## Quick start

From the repo root:

```bash
npm install
```

Add a **`.env`** file at the project root (the server loads it with `--env-file`). You’ll want at least `HTTP_PORT` for local dev; other variables depend on which features you use (database URLs, Spotify credentials, etc.).

**Development** — run the API and the Vite dev server in two terminals:

```bash
npm run dev:server
npm run dev:client
```

The client dev server proxies `/api` to the backend (default `http://localhost:9393` in Vite config—match your `HTTP_PORT`).

**Production-style** — build the client, then start the server (it serves `client/dist` and the API):

```bash
npm run build:client
npm start
```

## Observability (New Relic)

The API uses the [Node.js agent](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/es-modules/) with the ESM loader (`NODE_OPTIONS` in `server`’s `start` / `debug` scripts). Set in `.env`:

- `NEW_RELIC_APP_NAME` — application name in New Relic.
- `NEW_RELIC_LICENSE_KEY` — ingest license key.
- `NEW_RELIC_ENABLED` — `false` disables the agent (useful for local runs).
- `NEW_RELIC_PROXY_URL` — optional `http://user:pass@host:port` HTTP CONNECT proxy for **collector traffic only**. **Unset** → `server/newrelic.cjs` reuses `PROXY_URI`. **Set empty** → no NR proxy even if `PROXY_URI` is set.

`server/newrelic.cjs` turns on APM, distributed tracing, and **log forwarding**. Application logs are sent with `newrelic.recordLogEvent` from `server/src/utils/logger.js` (automatic Pino instrumentation is off—ESM/pino-pretty often skipped it). Custom measurements that used to go to Influx are **`ServerMetric`** custom events (`measurement` + fields).

**Nothing showing in New Relic?** Open `server/newrelic_agent.log`. If you see `CERT_HAS_EXPIRED` when talking to the collector, your **system clock is wrong** (ahead of the collector certificate’s validity) or TLS is being intercepted—sync time with NTP / fix the proxy. Quick check: `npm run nr:diag -w server` (sends a `DiagTest` custom event; allow ~1–2 minutes in the UI).

## Scripts

| Command            | What it does                    |
| ------------------ | ------------------------------- |
| `npm run dev:server` | API in development (with debug logging) |
| `npm run dev:client` | Vite dev server for the UI      |
| `npm run build:client` | Production build of the client |
| `npm start`        | Production server               |
| `npm run backfill:spotify-release-dates -- --mode=all` | On-demand Spotify release-date backfill via Python |
| `npm run backfill:spotify-audio-features -- --limit=100 --run-until-empty` | On-demand Spotify audio-features backfill via Python |
| `npm test`         | Server tests (Jest)             |

Install Python deps for the backfill command once with:

```bash
python3 -m pip install -r scripts/spotify_audio_features_backfill/requirements.txt
```

## License

MIT — see [server/package.json](server/package.json) for package metadata and links.
