import MySQLWrapper from '../../utils/mysql_wrapper.js';
import logger from '../../utils/logger.js';

const TABLE = 'nowplaying_chart_log';

/**
 * Returns the ISO year+week string for the given date (or now).
 * Format: "YYYYWW", e.g. "202614" for ISO week 14 of 2026.
 */
function getYearWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() * 100 + weekNo;
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
        `SELECT c.*, t.spotify_track_id ` +
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
 */
async function getChartEntries(chartId, yearWeek) {
    const weekClause = yearWeek
        ? `c.chart_year_week = ?`
        : `c.chart_year_week = (SELECT MAX(chart_year_week) FROM \`${TABLE}\` WHERE chart_id = ?)`;
    const params = [chartId, yearWeek || chartId];

    const [rows] = await MySQLWrapper.queryWithCache(
        `SELECT c.chart_position, c.chart_year_week, c.entry_artist, c.entry_title, c.entry_extra, ` +
        `t.spotify_track_id ` +
        `FROM \`${TABLE}\` c ` +
        `LEFT JOIN \`nowplaying_spotify_tracks\` t ON c.spotify_id = t.spotify_id ` +
        `WHERE c.chart_id = ? AND ${weekClause} ` +
        `ORDER BY c.chart_position ASC`,
        params,
        300,
    );

    return rows;
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
