/**
 * Release-decade filter for `spotify_release_date` on `nowplaying_spotify_tracks`.
 * Slug vocabulary is shared with the playlist page URL param `decade` (comma-separated).
 */

/** @type {Readonly<Record<string, readonly [number, number]>>} */
export const DECADE_SLUG_RANGES = Object.freeze({
    '60s': [1960, 1969],
    '70s': [1970, 1979],
    '80s': [1980, 1989],
    '90s': [1990, 1999],
    '00s': [2000, 2009],
    '10s': [2010, 2019],
    '20s': [2020, 2029],
});

const ORDERED = Object.keys(DECADE_SLUG_RANGES);

/**
 * @param {unknown} value Query string, comma-separated slugs (e.g. "60s,80s,20s")
 * @returns {string[]}
 */
export function parseDecadeSlugs(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }
    const seen = new Set();
    for (const part of value.split(',')) {
        const s = part.trim().toLowerCase();
        if (s && s in DECADE_SLUG_RANGES) {
            seen.add(s);
        }
    }
    return ORDERED.filter((k) => seen.has(k));
}

/**
 * @param {string} tableAlias MySQL table alias (validated)
 * @param {string[]} decades Decade slugs; empty = no filter
 * @returns {{ sql: string, params: unknown[] }}
 */
export function releaseDecadeYearClause(tableAlias, decades) {
    if (!decades || decades.length === 0) {
        return { sql: '', params: [] };
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableAlias)) {
        return { sql: '', params: [] };
    }
    const pieces = [];
    const params = [];
    for (const d of decades) {
        const range = DECADE_SLUG_RANGES[d];
        if (!range) {
            continue;
        }
        pieces.push(
            `(YEAR(${tableAlias}.spotify_release_date) >= ? AND YEAR(${tableAlias}.spotify_release_date) <= ?)`,
        );
        params.push(range[0], range[1]);
    }
    if (pieces.length === 0) {
        return { sql: '', params: [] };
    }
    return {
        sql: ` AND ${tableAlias}.spotify_release_date IS NOT NULL AND (${pieces.join(' OR ')})`,
        params,
    };
}
