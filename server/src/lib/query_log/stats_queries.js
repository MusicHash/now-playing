import MySQLWrapper from '../../utils/mysql_wrapper.js';

/** Default rolling window in days (`days` query param on stats routes). */
export const DEFAULT_STATS_DAYS = 7;
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
