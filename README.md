# Now Playing

A small dashboard for **radio play logs**. Explore how often tracks and artists show up over time, spot momentum, drill into details, and build playlists when you hook it up to Spotify.

## What’s inside

- **Play metrics** — Charts for plays over time, top tracks and artists, momentum, and drill-downs into specific songs or artists.
- **Generate playlist** — Turn what you’re seeing into playlists (with Spotify wired up).
- **REST API** — The Express server exposes `/api` routes for health, stations, stats, playlists, and more.

The UI is **React** (Vite); the backend is **Node** (Express) with optional **MySQL**, **Redis**, **InfluxDB**, and **Spotify** integration—configure what you need via a root `.env` file.

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

## Scripts

| Command            | What it does                    |
| ------------------ | ------------------------------- |
| `npm run dev:server` | API in development (with debug logging) |
| `npm run dev:client` | Vite dev server for the UI      |
| `npm run build:client` | Production build of the client |
| `npm start`        | Production server               |
| `npm test`         | Server tests (Jest)             |

## License

MIT — see [server/package.json](server/package.json) for package metadata and links.
