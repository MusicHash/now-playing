import MySQLWrapper from '../utils/mysql_wrapper.js';

const ENV_AUDIO_FEATURES_API_URL = 'SPOTIFY_AUDIO_FEATURES_API_URL';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;
const FETCH_TIMEOUT_MS = 120_000;

const UPSERT_SQL = `
INSERT INTO \`nowplaying_spotify_track_audio_features\`
(\`spotify_id\`, \`spotify_track_id\`, \`popularity\`, \`null_response\`, \`duration_ms\`, \`time_signature\`, \`key\`, \`mode\`,
 \`tempo\`, \`danceability\`, \`energy\`, \`loudness\`, \`speechiness\`, \`acousticness\`, \`instrumentalness\`, \`liveness\`, \`valence\`)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  \`spotify_track_id\` = VALUES(\`spotify_track_id\`),
  \`popularity\` = VALUES(\`popularity\`),
  \`null_response\` = VALUES(\`null_response\`),
  \`duration_ms\` = VALUES(\`duration_ms\`),
  \`time_signature\` = VALUES(\`time_signature\`),
  \`key\` = VALUES(\`key\`),
  \`mode\` = VALUES(\`mode\`),
  \`tempo\` = VALUES(\`tempo\`),
  \`danceability\` = VALUES(\`danceability\`),
  \`energy\` = VALUES(\`energy\`),
  \`loudness\` = VALUES(\`loudness\`),
  \`speechiness\` = VALUES(\`speechiness\`),
  \`acousticness\` = VALUES(\`acousticness\`),
  \`instrumentalness\` = VALUES(\`instrumentalness\`),
  \`liveness\` = VALUES(\`liveness\`),
  \`valence\` = VALUES(\`valence\`)
`.trim();

const REQUIRED_API_FIELDS = [
    'popularity',
    'null_response',
    'duration_ms',
    'time_signature',
    'key',
    'mode',
    'tempo',
    'danceability',
    'energy',
    'loudness',
    'speechiness',
    'acousticness',
    'instrumentalness',
    'liveness',
    'valence',
];

/**
 * @param {unknown} body
 * @param {number} spotifyId
 * @param {string} spotifyTrackId
 * @returns {number[] | null} bound params for UPSERT_SQL, or null if invalid
 */
function upsertParamsFromApiBody(body, spotifyId, spotifyTrackId) {
    if (!body || typeof body !== 'object') {
        return null;
    }
    for (const k of REQUIRED_API_FIELDS) {
        if (body[k] === undefined || body[k] === null) {
            return null;
        }
    }
    const apiId = body.id;
    if (typeof apiId === 'string' && apiId !== spotifyTrackId) {
        return null;
    }

    const popularity = Math.max(0, Math.min(100, Math.round(Number(body.popularity))));
    const nullResponse = Number(body.null_response) !== 0 ? 1 : 0;

    const params = [
        spotifyId,
        spotifyTrackId,
        popularity,
        nullResponse,
        Math.round(Number(body.duration_ms)),
        Math.round(Number(body.time_signature)),
        Math.round(Number(body.key)),
        Math.round(Number(body.mode)),
        Number(body.tempo),
        Number(body.danceability),
        Number(body.energy),
        Number(body.loudness),
        Number(body.speechiness),
        Number(body.acousticness),
        Number(body.instrumentalness),
        Number(body.liveness),
        Number(body.valence),
    ];
    for (let i = 2; i < params.length; i++) {
        if (!Number.isFinite(params[i])) {
            return null;
        }
    }
    return params;
}

/** @returns {string} Non-empty base URL (no trailing slash). */
export function getRequiredAudioFeaturesApiBaseUrl() {
    const raw = process.env[ENV_AUDIO_FEATURES_API_URL];
    const baseUrl = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
    if (!baseUrl) {
        throw new Error(`${ENV_AUDIO_FEATURES_API_URL} is not set`);
    }
    return baseUrl;
}

/** @returns {boolean} Whether the audio-features backfill can run (env is set). */
export function isAudioFeaturesApiConfigured() {
    const raw = process.env[ENV_AUDIO_FEATURES_API_URL];
    return typeof raw === 'string' && raw.trim().length > 0;
}

/**
 * @param {string} baseUrl
 * @param {string} spotifyTrackId
 * @param {*} logger
 */
async function fetchAudioFeaturesJson(baseUrl, spotifyTrackId, logger) {
    const url = `${baseUrl}/track/${encodeURIComponent(spotifyTrackId)}`;
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        const elapsedMs = Date.now() - t0;
        const text = await res.text();
        let json;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        return { res, json, elapsedMs };
    } catch (error) {
        const elapsedMs = Date.now() - t0;
        logger.warn({
            method: 'spotify_audio_features_backfill.fetch',
            message: 'Audio features HTTP request failed',
            spotify_track_id: spotifyTrackId,
            elapsed_ms: elapsedMs,
            error,
        });
        return { res: null, json: null, elapsedMs, error };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @typedef {object} AudioFeaturesBackfillProgress
 * @property {number} index 1-based index within this batch
 * @property {number} total rows in this batch
 * @property {number} spotify_id
 * @property {string} spotify_track_id
 * @property {string} spotify_artist_title
 * @property {string} spotify_track_title
 * @property {'upserted'|'not_found'|'http_error'|'invalid_response'|'fetch_error'} outcome
 * @property {number} elapsed_ms client-side round-trip for the audio-features HTTP call
 * @property {number} [http_status]
 * @property {number} [response_time_ms] from API payload when present
 */

/**
 * Tracks without a row in `nowplaying_spotify_track_audio_features`: LEFT JOIN + `a.spotify_id IS NULL`.
 * Processes rows sequentially (one HTTP request per track).
 *
 * @param {object} options
 * @param {number} [options.limit] batch size (default 25, max 500)
 * @param {(info: { requested_limit: number, candidates_selected: number }) => void | Promise<void>} [options.onBatchStart] after the SELECT
 * @param {(info: AudioFeaturesBackfillProgress) => void | Promise<void>} [options.onProgress] after each track
 * @param {() => boolean} [options.isAborted] if true, stops before the next track
 * @param {*} logger
 */
export async function backfillSpotifyAudioFeaturesBatch(logger, options = {}) {
    if (!MySQLWrapper.isEnabled()) {
        throw new Error('MySQL is not configured');
    }

    const baseUrl = getRequiredAudioFeaturesApiBaseUrl();
    const onProgress = options.onProgress;
    const isAborted = typeof options.isAborted === 'function' ? options.isAborted : () => false;

    const rawLimit = options.limit;
    const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Number.parseInt(String(rawLimit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const selectSql = `
SELECT t.\`spotify_id\`, t.\`spotify_track_id\`, t.\`spotify_artist_title\`, t.\`spotify_track_title\`
FROM \`nowplaying_spotify_tracks\` t
LEFT JOIN \`nowplaying_spotify_track_audio_features\` a ON a.\`spotify_id\` = t.\`spotify_id\`
WHERE a.\`spotify_id\` IS NULL
ORDER BY t.\`spotify_id\`
LIMIT ?
`.trim();

    const [rows] = await MySQLWrapper.query(selectSql, [limit]);

    if (typeof options.onBatchStart === 'function') {
        await options.onBatchStart({
            requested_limit: limit,
            candidates_selected: rows.length,
        });
    }

    const summary = {
        requested_limit: limit,
        candidates_selected: rows.length,
        upserted: 0,
        skipped_not_found: 0,
        skipped_http_error: 0,
        skipped_invalid_fields: 0,
        fetch_errors: 0,
        aborted_early: false,
    };

    const report = async (idx, row, payload) => {
        if (!onProgress) {
            return;
        }
        await onProgress({
            index: idx + 1,
            total: rows.length,
            spotify_id: row.spotify_id,
            spotify_track_id: row.spotify_track_id,
            spotify_artist_title: row.spotify_artist_title,
            spotify_track_title: row.spotify_track_title,
            ...payload,
        });
    };

    for (let i = 0; i < rows.length; i++) {
        if (isAborted()) {
            summary.aborted_early = true;
            break;
        }

        const row = rows[i];
        const spotifyId = row.spotify_id;
        const spotifyTrackId = row.spotify_track_id;

        const { res, json, elapsedMs, error } = await fetchAudioFeaturesJson(
            baseUrl,
            spotifyTrackId,
            logger,
        );

        if (error) {
            summary.fetch_errors += 1;
            await report(i, row, { outcome: 'fetch_error', elapsed_ms: elapsedMs });
            continue;
        }

        if (!res) {
            summary.fetch_errors += 1;
            await report(i, row, { outcome: 'fetch_error', elapsed_ms: elapsedMs });
            continue;
        }

        if (res.status === 404) {
            summary.skipped_not_found += 1;
            logger.info({
                method: 'spotify_audio_features_backfill.track',
                message: 'Audio features not found (404), skip insert',
                spotify_id: spotifyId,
                spotify_track_id: spotifyTrackId,
                elapsed_ms: elapsedMs,
            });
            await report(i, row, { outcome: 'not_found', elapsed_ms: elapsedMs, http_status: 404 });
            continue;
        }

        if (!res.ok) {
            summary.skipped_http_error += 1;
            logger.warn({
                method: 'spotify_audio_features_backfill.track',
                message: 'Audio features HTTP non-OK',
                spotify_id: spotifyId,
                spotify_track_id: spotifyTrackId,
                status: res.status,
                elapsed_ms: elapsedMs,
                body_preview: typeof json === 'object' ? json : undefined,
            });
            await report(i, row, {
                outcome: 'http_error',
                elapsed_ms: elapsedMs,
                http_status: res.status,
            });
            continue;
        }

        const params = upsertParamsFromApiBody(json, spotifyId, spotifyTrackId);
        if (!params) {
            summary.skipped_invalid_fields += 1;
            logger.warn({
                method: 'spotify_audio_features_backfill.track',
                message: 'Audio features response missing required fields or id mismatch',
                spotify_id: spotifyId,
                spotify_track_id: spotifyTrackId,
                elapsed_ms: elapsedMs,
            });
            await report(i, row, { outcome: 'invalid_response', elapsed_ms: elapsedMs, http_status: res.status });
            continue;
        }

        await MySQLWrapper.query(UPSERT_SQL, params);
        summary.upserted += 1;

        logger.info({
            method: 'spotify_audio_features_backfill.track',
            message: 'Audio features stored',
            spotify_id: spotifyId,
            spotify_track_id: spotifyTrackId,
            elapsed_ms: elapsedMs,
            response_time_ms: json?.response_time_ms,
        });
        await report(i, row, {
            outcome: 'upserted',
            elapsed_ms: elapsedMs,
            http_status: res.status,
            response_time_ms: typeof json?.response_time_ms === 'number' ? json.response_time_ms : undefined,
        });
    }

    logger.info({
        method: 'spotify_audio_features_backfill.batch',
        message: 'Audio features backfill batch finished',
        ...summary,
    });

    return summary;
}
