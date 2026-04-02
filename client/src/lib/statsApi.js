/** Defaults aligned with server `stats_queries.js`. */
export const DEFAULT_STATS_DAYS = 7;
export const MAX_STATS_DAYS = 365;
export const DEFAULT_STATS_LIMIT = 100;
export const MAX_STATS_LIMIT = 200;

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

/**
 * @param {{ days?: unknown, limit?: unknown }} opts
 */
export function buildTopStationsQuery(opts) {
    const p = new URLSearchParams();
    p.set('days', String(clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    p.set('limit', String(clampInt(opts.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT)));
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
 * @param {{ days?: unknown, limit?: unknown }} params
 */
export function getTopStationsUrl(params) {
    return `/api/data/stats/top-stations?${buildTopStationsQuery(params)}`;
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
