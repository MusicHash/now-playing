import MySQLWrapper from '../../utils/mysql_wrapper.js';

/** Default rolling window in days (`days` query param on stats routes). */
export const DEFAULT_STATS_DAYS = 7;

/** Min total plays in the rolling `days` window to include a track in momentum ranking (noise floor). */
export const MOMENTUM_MIN_PLAYS_IN_WINDOW = 10;

/** `direction` query param: rising vs falling play counts between windows. */
export const MOMENTUM_DIRECTION_UP = 'up';
export const MOMENTUM_DIRECTION_DOWN = 'down';

/**
 * @param {unknown} value
 * @returns {typeof MOMENTUM_DIRECTION_UP | typeof MOMENTUM_DIRECTION_DOWN}
 */
export function parseMomentumDirection(value) {
    const s = String(value ?? '').trim().toLowerCase();
    if (s === MOMENTUM_DIRECTION_DOWN || s === 'falling' || s === 'negative') {
        return MOMENTUM_DIRECTION_DOWN;
    }
    return MOMENTUM_DIRECTION_UP;
}
export const MAX_STATS_DAYS = 365;
export const DEFAULT_STATS_LIMIT = 35;
export const MAX_STATS_LIMIT = 200;
export const DEFAULT_RECENT_LIMIT = 50;
export const MAX_RECENT_LIMIT = 500;

/** Allowed `resolutionMinutes` for plays-by-bucket drill-down APIs. */
export const ALLOWED_BUCKET_MINUTES = [1, 5, 10, 15, 30, 60, 120, 240, 480, 1440];
export const DEFAULT_BUCKET_MINUTES = 60;

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
 * OLS slope of daily plays vs day index 0..n-1 (plays per day trend; matches chart spine order).
 * @param {number[]} y
 * @returns {number | null}
 */
function olsSlopePlaysPerDay(y) {
    const n = y.length;
    if (n < 2) {
        return null;
    }
    let sumX = 0;
    let sumX2 = 0;
    let sumY = 0;
    let sumXY = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumX2 += i * i;
        const yi = y[i];
        sumY += yi;
        sumXY += i * yi;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-12) {
        return null;
    }
    return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Station filter for joined `station_log` queries in stats helpers.
 *
 * @param {{ days?: unknown, limit?: unknown, station?: string, stationLike?: string }} opts
 */
function stationWhereClause(opts) {
    if (opts.station) {
        return { sql: ' AND station_log.log_station_id = ?', params: [opts.station] };
    }
    if (opts.stationLike) {
        return {
            sql: ' AND station_log.log_station_id LIKE CONCAT(\'%\', ?, \'%\')',
            params: [opts.stationLike],
        };
    }
    return { sql: '', params: [] };
}

/**
 * @param {{ days?: unknown, station?: string, stationLike?: string }} opts
 */
export async function getPlaysByDay(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);

    let sql = `
        SELECT
            DATE(log_datetime_played) AS play_date,
            DAYNAME(log_datetime_played) AS weekday,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log
        WHERE
            log_datetime_played >= NOW() - INTERVAL ? DAY
    `;
    const params = [days];

    if (opts.station) {
        sql += ' AND log_station_id = ?';
        params.push(opts.station);
    } else if (opts.stationLike) {
        sql += ' AND log_station_id LIKE CONCAT(\'%\', ?, \'%\')';
        params.push(opts.stationLike);
    }

    sql += `
        GROUP BY
            play_date,
            weekday
        ORDER BY
            play_date DESC
    `;

    const [rows] = await MySQLWrapper.query(sql, params);
    return rows;
}

/**
 * @param {{ days?: unknown, limit?: unknown, station?: string, stationLike?: string }} opts
 */
export async function getMostPlayedTracks(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const limit = clampInt(opts.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
    const { sql: extraWhere, params: extraParams } = stationWhereClause(opts);

    const sql = `
        SELECT
            spotify_tracks.spotify_track_id,
            spotify_tracks.spotify_artist_title,
            spotify_tracks.spotify_track_title,
            spotify_tracks.spotify_popularity,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log station_log
        JOIN
            nowplaying_spotify_tracks spotify_tracks
            ON station_log.spotify_id = spotify_tracks.spotify_id
        WHERE
            station_log.log_datetime_played >= NOW() - INTERVAL ? DAY
            ${extraWhere}
        GROUP BY
            spotify_tracks.spotify_track_id,
            spotify_tracks.spotify_artist_title,
            spotify_tracks.spotify_track_title,
            spotify_tracks.spotify_popularity
        ORDER BY play_count DESC
        LIMIT ?
    `;

    const [rows] = await MySQLWrapper.query(sql, [days, ...extraParams, limit]);
    return rows;
}

/**
 * Tracks ranked by OLS linear trend of daily plays over the rolling `days` window (same spine as the chart).
 * `momentum_score` is estimated change in plays per calendar day (positive = rising, negative = falling).
 * {@link MOMENTUM_MIN_PLAYS_IN_WINDOW} filters very sparse series. `direction` selects positive vs negative slope.
 *
 * @param {{ days?: unknown, limit?: unknown, station?: string, stationLike?: string, direction?: unknown }} opts
 * @returns {Promise<Array<Record<string, unknown> & { daily_plays: Array<{ play_date: string, play_count: number }> }>>}
 */
export async function getTopTracksByMomentum(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const limit = clampInt(opts.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
    const { sql: extraWhere, params: extraParams } = stationWhereClause(opts);
    const direction = parseMomentumDirection(opts.direction);
    const rising = direction === MOMENTUM_DIRECTION_UP;

    const spineSql = `
        WITH RECURSIVE dates AS (
            SELECT DATE(NOW() - INTERVAL ? DAY) AS d
            UNION ALL
            SELECT d + INTERVAL 1 DAY FROM dates WHERE d < DATE(NOW())
        )
        SELECT d AS play_date FROM dates ORDER BY d ASC
    `;
    const [spineRows] = await MySQLWrapper.query(spineSql, [days]);
    const spineDates = spineRows.map((r) => {
        const raw = r.play_date;
        if (raw instanceof Date) {
            return raw.toISOString().slice(0, 10);
        }
        return String(raw).slice(0, 10);
    });

    if (spineDates.length < 2) {
        return [];
    }

    const dailyAggSql = `
        SELECT
            spotify_tracks.spotify_track_id,
            DATE(station_log.log_datetime_played) AS play_date,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log station_log
        JOIN
            nowplaying_spotify_tracks spotify_tracks
            ON station_log.spotify_id = spotify_tracks.spotify_id
        WHERE
            station_log.log_datetime_played >= NOW() - INTERVAL ? DAY
            ${extraWhere}
        GROUP BY
            spotify_tracks.spotify_track_id,
            DATE(station_log.log_datetime_played)
    `;
    const [dailyAggRows] = await MySQLWrapper.query(dailyAggSql, [days, ...extraParams]);

    /** @type {Map<string, Map<string, number>>} */
    const byTrackDate = new Map();
    for (const row of dailyAggRows) {
        const tid = String(row.spotify_track_id);
        let dateKey = row.play_date;
        if (dateKey instanceof Date) {
            dateKey = dateKey.toISOString().slice(0, 10);
        } else {
            dateKey = String(dateKey).slice(0, 10);
        }
        if (!byTrackDate.has(tid)) {
            byTrackDate.set(tid, new Map());
        }
        byTrackDate.get(tid).set(dateKey, Number(row.play_count) || 0);
    }

    /** @type {Array<{ spotify_track_id: string, momentum_score: number }>} */
    const scored = [];
    for (const [tid, dayMap] of byTrackDate) {
        const y = spineDates.map((d) => dayMap.get(d) ?? 0);
        const total = y.reduce((a, b) => a + b, 0);
        if (total < MOMENTUM_MIN_PLAYS_IN_WINDOW) {
            continue;
        }
        const slope = olsSlopePlaysPerDay(y);
        if (slope === null) {
            continue;
        }
        if (rising && slope <= 0) {
            continue;
        }
        if (!rising && slope >= 0) {
            continue;
        }
        scored.push({
            spotify_track_id: String(tid),
            momentum_score: Number(slope.toFixed(6)),
        });
    }

    scored.sort((a, b) => {
        const diff = rising ? b.momentum_score - a.momentum_score : a.momentum_score - b.momentum_score;
        if (diff !== 0) {
            return diff;
        }
        return a.spotify_track_id.localeCompare(b.spotify_track_id);
    });

    const top = scored.slice(0, limit);
    if (!top.length) {
        return [];
    }

    const trackIds = top.map((r) => r.spotify_track_id);
    const inList = trackIds.map(() => '?').join(', ');
    const metaSql = `
        SELECT
            tr.spotify_track_id,
            ANY_VALUE(tr.spotify_artist_title) AS spotify_artist_title,
            ANY_VALUE(tr.spotify_track_title) AS spotify_track_title,
            ANY_VALUE(tr.spotify_popularity) AS spotify_popularity,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log station_log
        JOIN
            nowplaying_spotify_tracks tr
            ON station_log.spotify_id = tr.spotify_id
        WHERE
            station_log.log_datetime_played >= NOW() - INTERVAL ? DAY
            ${extraWhere}
            AND tr.spotify_track_id IN (${inList})
        GROUP BY
            tr.spotify_track_id
    `;
    const [metaRows] = await MySQLWrapper.query(metaSql, [days, ...extraParams, ...trackIds]);

    /** @type {Map<string, Record<string, unknown>>} */
    const metaById = new Map(metaRows.map((r) => [String(r.spotify_track_id), r]));

    return top.map((row) => {
        const tid = row.spotify_track_id;
        const meta = metaById.get(tid);
        const dayMap = byTrackDate.get(tid) ?? new Map();
        const daily_plays = spineDates.map((play_date) => ({
            play_date,
            play_count: dayMap.get(play_date) ?? 0,
        }));
        return {
            ...(meta || {}),
            spotify_track_id: tid,
            momentum_score: row.momentum_score,
            daily_plays,
        };
    });
}

/**
 * @param {{ days?: unknown, limit?: unknown, station?: string, stationLike?: string }} opts
 */
export async function getTopArtists(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const limit = clampInt(opts.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);

    let sql = `
        SELECT
            log_artist,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log
        WHERE
            log_datetime_played >= NOW() - INTERVAL ? DAY
    `;
    const params = [days];

    if (opts.station) {
        sql += ' AND log_station_id = ?';
        params.push(opts.station);
    } else if (opts.stationLike) {
        sql += ' AND log_station_id LIKE CONCAT(\'%\', ?, \'%\')';
        params.push(opts.stationLike);
    }

    sql += `
        GROUP BY
            log_artist
        ORDER BY
            play_count DESC
        LIMIT ?
    `;
    params.push(limit);

    const [rows] = await MySQLWrapper.query(sql, params);
    return rows;
}

/**
 * @param {{ days?: unknown, limit?: unknown }} opts
 */
export async function getTopStations(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const limit = clampInt(opts.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);

    const sql = `
        SELECT
            log_station_id,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log
        WHERE
            log_datetime_played >= NOW() - INTERVAL ? DAY
        GROUP BY
            log_station_id
        ORDER BY
            play_count DESC
        LIMIT ?
    `;

    const [rows] = await MySQLWrapper.query(sql, [days, limit]);
    return rows;
}

/**
 * Most recent log rows with Spotify metadata, optionally scoped to one station or LIKE pattern.
 * Rows are limited to a rolling window of `days` (default {@link DEFAULT_STATS_DAYS}), then by `limit`.
 *
 * @param {{ days?: unknown, limit?: unknown, station?: string, stationLike?: string }} opts
 */
export async function getRecentPlays(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const limit = clampInt(opts.limit, DEFAULT_RECENT_LIMIT, MAX_RECENT_LIMIT);
    const { sql: extraWhere, params: extraParams } = stationWhereClause(opts);

    const sql = `
        SELECT
            station_log.log_id,
            station_log.log_station_id,
            station_log.log_datetime_played,
            station_log.log_artist,
            station_log.log_title,
            spotify_tracks.spotify_track_id,
            spotify_tracks.spotify_artist_title,
            spotify_tracks.spotify_track_title,
            spotify_tracks.spotify_popularity
        FROM
            nowplaying_station_log station_log
        JOIN
            nowplaying_spotify_tracks spotify_tracks
            ON station_log.spotify_id = spotify_tracks.spotify_id
        WHERE
            station_log.log_datetime_played >= NOW() - INTERVAL ? DAY
            ${extraWhere}
        ORDER BY
            station_log.log_datetime_played DESC
        LIMIT ?
    `;

    const [rows] = await MySQLWrapper.query(sql, [days, ...extraParams, limit]);
    return rows;
}

/**
 * Distinct station ids present in the play log (any time), sorted alphabetically.
 *
 * @returns {Promise<string[]>}
 */
export async function getDistinctStationsLogged() {
    const sql = `
        SELECT DISTINCT log_station_id
        FROM nowplaying_station_log
        ORDER BY log_station_id ASC
    `;

    const [rows] = await MySQLWrapper.query(sql, []);
    return rows.map((row) => row.log_station_id);
}

/**
 * Plays per time bucket for one Spotify track, within the rolling `days` window.
 *
 * @param {{ days?: unknown, station?: string, stationLike?: string, resolutionMinutes?: unknown, trackId: string }} opts
 */
export async function getPlaysByBucketForTrack(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const bucketMin = clampBucketMinutes(opts.resolutionMinutes);
    const bucketSec = bucketMin * 60;
    const { sql: extraWhere, params: extraParams } = stationWhereClause(opts);

    const sql = `
        SELECT
            FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(station_log.log_datetime_played) / ?) * ?) AS bucket_start,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log station_log
        INNER JOIN
            nowplaying_spotify_tracks spotify_tracks
            ON station_log.spotify_id = spotify_tracks.spotify_id
        WHERE
            station_log.log_datetime_played >= NOW() - INTERVAL ? DAY
            AND spotify_tracks.spotify_track_id = ?
            ${extraWhere}
        GROUP BY
            FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(station_log.log_datetime_played) / ?) * ?)
        ORDER BY
            bucket_start ASC
    `;

    const params = [bucketSec, bucketSec, days, opts.trackId, ...extraParams, bucketSec, bucketSec];
    const [rows] = await MySQLWrapper.query(sql, params);
    return rows;
}

/**
 * Plays per time bucket for one artist (`log_artist` exact match), within the rolling `days` window.
 *
 * @param {{ days?: unknown, station?: string, stationLike?: string, resolutionMinutes?: unknown, artist: string }} opts
 */
export async function getPlaysByBucketForArtist(opts = {}) {
    const days = clampInt(opts.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
    const bucketMin = clampBucketMinutes(opts.resolutionMinutes);
    const bucketSec = bucketMin * 60;

    let sql = `
        SELECT
            FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(log_datetime_played) / ?) * ?) AS bucket_start,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log
        WHERE
            log_datetime_played >= NOW() - INTERVAL ? DAY
            AND log_artist = ?
    `;
    const params = [bucketSec, bucketSec, days, opts.artist];

    if (opts.station) {
        sql += ' AND log_station_id = ?';
        params.push(opts.station);
    } else if (opts.stationLike) {
        sql += ' AND log_station_id LIKE CONCAT(\'%\', ?, \'%\')';
        params.push(opts.stationLike);
    }

    sql += `
        GROUP BY
            FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(log_datetime_played) / ?) * ?)
        ORDER BY
            bucket_start ASC
    `;
    params.push(bucketSec, bucketSec);

    const [rows] = await MySQLWrapper.query(sql, params);
    return rows;
}
