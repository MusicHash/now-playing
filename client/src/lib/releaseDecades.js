/**
 * Decade filter (release year) — `decade` URL param, comma-separated slugs.
 * Must match server `server/src/lib/release_decades.js` slugs.
 */

/** @type {Array<{ id: string, label: string }>} */
export const PLAYLIST_DECADE_OPTIONS = [
    { id: '60s', label: '1960s' },
    { id: '70s', label: '1970s' },
    { id: '80s', label: '1980s' },
    { id: '90s', label: '1990s' },
    { id: '00s', label: '2000s' },
    { id: '10s', label: '2010s' },
    { id: '20s', label: '2020s' },
];

const VALID_IDS = new Set(PLAYLIST_DECADE_OPTIONS.map((o) => o.id));

/**
 * @param {URLSearchParams} sp
 * @returns {string[]} Sorted valid decade ids (e.g. ['60s','80s'])
 */
export function parsePlaylistDecades(sp) {
    const raw = sp.get('decade');
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    const out = new Set();
    for (const part of raw.split(',')) {
        const id = part.trim().toLowerCase();
        if (id && VALID_IDS.has(id)) {
            out.add(id);
        }
    }
    return PLAYLIST_DECADE_OPTIONS.map((o) => o.id).filter((id) => out.has(id));
}

/**
 * @param {string[]} decades
 * @returns {string} Query value or ''
 */
export function formatPlaylistDecadesParam(decades) {
    if (!Array.isArray(decades) || decades.length === 0) {
        return '';
    }
    return PLAYLIST_DECADE_OPTIONS.map((o) => o.id)
        .filter((id) => decades.includes(id))
        .join(',');
}
