import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../config/playlist_moods.json');

/** Spotify audio-features columns allowed in mood range filters. */
const ALLOWED_FILTER_KEYS = new Set([
    'danceability',
    'energy',
    'valence',
    'acousticness',
    'instrumentalness',
    'speechiness',
    'liveness',
    'tempo',
    'mode',
]);

/** @type {Map<string, { id: string, label: string, filters: Record<string, { min?: number, max?: number }> }> | null} */
let moodById = null;

function loadMoods() {
    if (moodById) {
        return;
    }
    moodById = new Map();
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data.moods || !Array.isArray(data.moods)) {
        return;
    }
    for (const m of data.moods) {
        if (!m || typeof m.id !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(m.id)) {
            continue;
        }
        const id = m.id.toLowerCase();
        const label = typeof m.label === 'string' ? m.label : id;
        /** @type {Record<string, { min?: number, max?: number }>} */
        const filters = {};
        if (m.filters && typeof m.filters === 'object' && !Array.isArray(m.filters)) {
            for (const [col, range] of Object.entries(m.filters)) {
                if (!ALLOWED_FILTER_KEYS.has(col) || !range || typeof range !== 'object') {
                    continue;
                }
                /** @type {{ min?: number, max?: number }} */
                const f = {};
                if (range.min != null && Number.isFinite(Number(range.min))) {
                    f.min = Number(range.min);
                }
                if (range.max != null && Number.isFinite(Number(range.max))) {
                    f.max = Number(range.max);
                }
                if (Object.keys(f).length) {
                    filters[col] = f;
                }
            }
        }
        moodById.set(id, { id, label, filters });
    }
}

/**
 * @returns {Array<{ id: string, label: string }>}
 */
export function getPlaylistMoodsForApi() {
    loadMoods();
    return Array.from(moodById.values())
        .filter((m) => Object.keys(m.filters).length > 0)
        .map(({ id, label }) => ({ id, label }));
}

/**
 * EXISTS clause: track has a real audio-features row matching the mood ranges.
 *
 * @param {string} spotifyTracksAlias Safe alias for `nowplaying_spotify_tracks` (e.g. `spotify_tracks`, `t`).
 * @param {{ mood?: string }} opts
 * @returns {{ sql: string, params: number[] }}
 */
export function moodExistsClause(spotifyTracksAlias, opts) {
    loadMoods();
    const raw = typeof opts.mood === 'string' ? opts.mood.trim().toLowerCase() : '';
    if (!raw || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(spotifyTracksAlias)) {
        return { sql: '', params: [] };
    }
    const def = moodById.get(raw);
    if (!def || !Object.keys(def.filters).length) {
        return { sql: '', params: [] };
    }

    const innerParts = ['af.null_response = 0'];
    const params = [];

    for (const [col, range] of Object.entries(def.filters)) {
        if (!ALLOWED_FILTER_KEYS.has(col)) {
            continue;
        }
        const quotedCol = `\`${col}\``;
        if (range.min != null && Number.isFinite(range.min)) {
            innerParts.push(`af.${quotedCol} >= ?`);
            params.push(range.min);
        }
        if (range.max != null && Number.isFinite(range.max)) {
            innerParts.push(`af.${quotedCol} <= ?`);
            params.push(range.max);
        }
    }

    if (innerParts.length <= 1) {
        return { sql: '', params: [] };
    }

    const cond = innerParts.join(' AND ');
    return {
        sql: ` AND EXISTS (
            SELECT 1 FROM nowplaying_spotify_track_audio_features af
            WHERE af.spotify_id = ${spotifyTracksAlias}.spotify_id AND ${cond}
        )`,
        params,
    };
}
