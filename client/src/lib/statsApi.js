/** Defaults aligned with server `stats_queries.js`. */
export const DEFAULT_STATS_DAYS = 7;
export const MAX_STATS_DAYS = 365;
export const DEFAULT_STATS_LIMIT = 30;
export const MAX_STATS_LIMIT = 200;

/** Must match server `ALLOWED_BUCKET_MINUTES`. */
export const ALLOWED_BUCKET_MINUTES = [1, 5, 10, 15, 30, 60, 120, 240, 480, 1440];
export const DEFAULT_BUCKET_MINUTES = 1440;

export const BUCKET_RESOLUTION_OPTIONS = [
    { value: 1, label: '1 minute' },
    { value: 5, label: '5 minutes' },
    { value: 10, label: '10 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 240, label: '4 hours' },
    { value: 480, label: '8 hours' },
    { value: 1440, label: '1 day' },
];

/**
 * @param {unknown} value
 */
export function clampBucketMinutes(value) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n) || !ALLOWED_BUCKET_MINUTES.includes(n)) {
        return DEFAULT_BUCKET_MINUTES;
    }
    return n;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} max
 */
export function clampInt(value, fallback, max) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n) || n < 1) {
        return fallback;
    }
    return Math.min(n, max);
}

/**
 * @param {string[]} configured
 * @param {string[]} logged
 */
export function mergeStationIds(configured, logged) {
    return [...new Set([...(configured || []), ...(logged || [])])].sort((a, b) =>
        a.localeCompare(b),
    );
}

/**
 * @param {{ days?: unknown, station?: string }} opts
 */
export function buildPlaysByDayQuery(opts) {
    const p = new URLSearchParams();
    p.set('days', String(clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    if (opts.station) {
        p.set('station', opts.station);
    }
    return p;
}

/**
 * @param {{ days?: unknown, limit?: unknown, station?: string }} opts
 */
export function buildRankedQuery(opts) {
    const p = new URLSearchParams();
    p.set('days', String(clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    p.set('limit', String(clampInt(opts.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT)));
    if (opts.station) {
        p.set('station', opts.station);
    }
    return p;
}

export function getStationsUrl() {
    return '/api/data/stations';
}

/**
 * @param {{ days?: unknown, station?: string }} params
 */
export function getPlaysByDayUrl(params) {
    return `/api/data/stats/plays-by-day?${buildPlaysByDayQuery(params)}`;
}

/**
 * @param {{ days?: unknown, limit?: unknown, station?: string }} params
 */
export function getTopTracksUrl(params) {
    return `/api/data/stats/top-tracks?${buildRankedQuery(params)}`;
}

/**
 * @param {{ days?: unknown, limit?: unknown, station?: string }} params
 */
export function getTopArtistsUrl(params) {
    return `/api/data/stats/top-artists?${buildRankedQuery(params)}`;
}

/**
 * @param {{
 *   days?: unknown,
 *   station?: string,
 *   resolutionMinutes?: unknown,
 *   spotify_track_id: string,
 * }} params
 */
export function getPlaysByBucketTrackUrl(params) {
    const p = new URLSearchParams();
    p.set('days', String(clampInt(params.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    p.set('resolutionMinutes', String(clampBucketMinutes(params.resolutionMinutes)));
    p.set('spotify_track_id', params.spotify_track_id);
    if (params.station) {
        p.set('station', params.station);
    }
    return `/api/data/stats/plays-by-bucket/track?${p}`;
}

/**
 * @param {{
 *   days?: unknown,
 *   station?: string,
 *   resolutionMinutes?: unknown,
 *   artist: string,
 * }} params
 */
export function getPlaysByBucketArtistUrl(params) {
    const p = new URLSearchParams();
    p.set('days', String(clampInt(params.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    p.set('resolutionMinutes', String(clampBucketMinutes(params.resolutionMinutes)));
    p.set('artist', params.artist);
    if (params.station) {
        p.set('station', params.station);
    }
    return `/api/data/stats/plays-by-bucket/artist?${p}`;
}

/**
 * @param {string} url
 */
export async function fetchJson(url) {
    const res = await fetch(url);
    let body = {};
    try {
        body = await res.json();
    } catch {
        body = {};
    }
    if (!res.ok) {
        const err = new Error(
            typeof body.error === 'string'
                ? body.error
                : typeof body.message === 'string'
                  ? body.message
                  : res.statusText,
        );
        err.status = res.status;
        err.body = body;
        throw err;
    }
    return body;
}
