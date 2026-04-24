import MySQLWrapper from '../../utils/mysql_wrapper.js';
import logger from '../../utils/logger.js';

const TABLE = 'nowplaying_chart_log';

const MS_PER_DAY = 86400000;

/**
 * @param {{ genre?: string }} opts
 * @returns {{ sql: string, params: string[] }}
 */
function chartGenreExistsClause(opts) {
    const g = typeof opts.genre === 'string' ? opts.genre.trim() : '';
    if (!g) {
        return { sql: '', params: [] };
    }
    return {
        sql: ` AND EXISTS (
            SELECT 1 FROM nowplaying_spotify_track_genres stg
            WHERE stg.spotify_id = t.spotify_id AND stg.genre = ?
        )`,
        params: [g],
    };
}

/**
 * UTC calendar day (y-m-d) at local midnight → ms for Tuesday 00:00 UTC that starts the Tue–Mon block containing that day.
 */
function utcAnchorTuesdayMidnightMs(y, monthIndex, day) {
    const midnight = Date.UTC(y, monthIndex, day, 0, 0, 0, 0);
    const dow = new Date(midnight).getUTCDay();
    const daysBack = (dow - 2 + 7) % 7;
    return midnight - daysBack * MS_PER_DAY;
}

/**
 * Chart period id: weeks start Tuesday 00:00 UTC. Encoded as YYYYWW (e.g. 202603).
 * Chart year is the UTC calendar year of Thursday of the block (anchor Tuesday + 2 days).
 * Week 1 is the Tue–Mon block that contains Jan 1 UTC.
 *
 * @param {Date} [date=new Date()]
 * @returns {number}
 */
function getYearWeek(date = new Date()) {
    const anchorMs = utcAnchorTuesdayMidnightMs(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const thursdayMs = anchorMs + 2 * MS_PER_DAY;
    const chartYear = new Date(thursdayMs).getUTCFullYear();
    const week1AnchorMs = utcAnchorTuesdayMidnightMs(chartYear, 0, 1);
    const weekNo = 1 + Math.floor((anchorMs - week1AnchorMs) / MS_PER_DAY / 7);
    return chartYear * 100 + weekNo;
}

async function doesChartWeekExist(chartId, yearWeek) {
    const [rows] = await MySQLWrapper.query(
        `SELECT 1 FROM \`${TABLE}\` WHERE chart_id = ? AND chart_year_week = ? LIMIT 1`,
        [chartId, yearWeek],
    );

    return rows.length > 0;
}

/**
 * Bulk-insert all positions for a single chart snapshot.
 * `fields` is the array of enriched entries:
 *   [{ artist, title, spotifyId?, ...extras }, ...]
 * `spotifyId` (INT or null) is the FK to nowplaying_spotify_tracks.
 */
async function insertChartEntries(chartId, yearWeek, fields) {
    if (!fields || fields.length === 0) {
        logger.warn({
            method: 'insertChartEntries',
            message: 'No fields to insert',
            metadata: { chartId, yearWeek },
        });
        return;
    }

    const KNOWN_KEYS = new Set(['artist', 'title', 'spotifyId']);
    const timestampNow = Math.floor(Date.now() / 1000);

    const values = [];
    const placeholders = [];

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const artist = field.artist || '';
        const title = field.title || '';
        const position = i + 1;
        const spotifyId = field.spotifyId ?? null;

        const extra = {};
        for (const key of Object.keys(field)) {
            if (!KNOWN_KEYS.has(key)) {
                extra[key] = field[key];
            }
        }
        const extraJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;

        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        values.push(chartId, yearWeek, position, spotifyId, artist, title, extraJson, timestampNow);
    }

    const sql =
        `INSERT INTO \`${TABLE}\` (chart_id, chart_year_week, chart_position, spotify_id, entry_artist, entry_title, entry_extra, entry_timestamp_fetched) ` +
        `VALUES ${placeholders.join(', ')}`;

    await MySQLWrapper.query(sql, values);

    logger.info({
        method: 'insertChartEntries',
        message: `Inserted ${fields.length} entries for ${chartId} week ${yearWeek}`,
    });
}

/**
 * Returns the latest (most recent week) chart entries for a given chart,
 * joined with spotify tracks to get spotify_track_id for direct URI building.
 * Ordered by position.
 */
async function getLatestChartEntries(chartId) {
    const [rows] = await MySQLWrapper.queryWithCache(
        `SELECT c.*, t.spotify_track_id, t.spotify_isrc ` +
        `FROM \`${TABLE}\` c ` +
        `LEFT JOIN \`nowplaying_spotify_tracks\` t ON c.spotify_id = t.spotify_id ` +
        `WHERE c.chart_id = ? ` +
        `AND c.chart_year_week = (SELECT MAX(chart_year_week) FROM \`${TABLE}\` WHERE chart_id = ?) ` +
        `ORDER BY c.chart_position ASC`,
        [chartId, chartId],
        300,
    );

    return rows;
}

/**
 * Returns chart entries for a given chart and optional week.
 * If yearWeek is falsy, returns the latest available week.
 * Joined with spotify tracks for spotify_track_id.
 * Each row includes `previous_position` (null if new entry) and
 * `position_change` (positive = moved up, negative = moved down, null if new).
 */
async function getChartEntries(chartId, yearWeek, opts = {}) {
    const { sql: genreSql, params: genreParams } = chartGenreExistsClause(opts);
    const weekClause = yearWeek
        ? `c.chart_year_week = ?`
        : `c.chart_year_week = (SELECT MAX(chart_year_week) FROM \`${TABLE}\` WHERE chart_id = ?)`;
    const params = [chartId, yearWeek || chartId, ...genreParams];

    const [rows] = await MySQLWrapper.queryWithCache(
        `SELECT c.chart_position, c.chart_year_week, c.entry_artist, c.entry_title, c.entry_extra, ` +
        `c.spotify_id, t.spotify_track_id, t.spotify_isrc ` +
        `FROM \`${TABLE}\` c ` +
        `LEFT JOIN \`nowplaying_spotify_tracks\` t ON c.spotify_id = t.spotify_id ` +
        `WHERE c.chart_id = ? AND ${weekClause}${genreSql} ` +
        `ORDER BY c.chart_position ASC`,
        params,
        300,
    );

    if (rows.length === 0) return rows;

    const resolvedWeek = rows[0].chart_year_week;

    const [prevRows] = await MySQLWrapper.queryWithCache(
        `SELECT c.chart_position, c.spotify_id, c.entry_artist, c.entry_title ` +
        `FROM \`${TABLE}\` c ` +
        `LEFT JOIN \`nowplaying_spotify_tracks\` t ON c.spotify_id = t.spotify_id ` +
        `WHERE c.chart_id = ? AND c.chart_year_week = ` +
        `(SELECT MAX(chart_year_week) FROM \`${TABLE}\` WHERE chart_id = ? AND chart_year_week < ?)` +
        `${genreSql} ` +
        `ORDER BY c.chart_position ASC`,
        [chartId, chartId, resolvedWeek, ...genreParams],
        300,
    );

    const prevBySpotifyId = new Map();
    const prevByArtistTitle = new Map();
    for (const r of prevRows) {
        if (r.spotify_id != null) {
            prevBySpotifyId.set(r.spotify_id, r.chart_position);
        }
        prevByArtistTitle.set(`${r.entry_artist}|||${r.entry_title}`, r.chart_position);
    }

    const enriched = rows.map(({ spotify_id, ...row }) => {
        let previous_position = null;
        if (spotify_id != null && prevBySpotifyId.has(spotify_id)) {
            previous_position = prevBySpotifyId.get(spotify_id);
        } else {
            const key = `${row.entry_artist}|||${row.entry_title}`;
            previous_position = prevByArtistTitle.get(key) ?? null;
        }
        const position_change = previous_position != null ? previous_position - row.chart_position : null;
        return { ...row, previous_position, position_change };
    });
    return enriched;
}

/**
 * Returns all distinct year-week values stored for a given chart, newest first.
 */
async function getAvailableWeeks(chartId) {
    const [rows] = await MySQLWrapper.queryWithCache(
        `SELECT DISTINCT chart_year_week FROM \`${TABLE}\` WHERE chart_id = ? ORDER BY chart_year_week DESC`,
        [chartId],
        3600,
    );

    return rows.map((r) => r.chart_year_week);
}

export {
    getYearWeek,
    doesChartWeekExist,
    insertChartEntries,
    getLatestChartEntries,
    getChartEntries,
    getAvailableWeeks,
};
