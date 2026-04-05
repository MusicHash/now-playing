/**
 * Residual match for history-style playlists: find songs newly at the top
 * (including re-plays that bump a track from lower positions).
 * Identity: Spotify track id from `track_id` or `id` when present; otherwise
 * normalized artist + title (for legacy snapshots or tests without ids).
 */

/**
 * Normalize a single field for comparison/storage: NFKC, trim, collapse internal whitespace.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeHistoryField(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Legacy key: artist + title only (snapshots/tests without Spotify ids).
 * @param {{ artist?: string, title?: string }} s
 * @returns {string}
 */
export function songKey(s) {
    return `${normalizeHistoryField(s?.artist)}\u0000${normalizeHistoryField(s?.title)}`;
}

/**
 * @param {{ track_id?: string, id?: string }} s
 * @returns {string}
 */
export function extractSpotifyTrackId(s) {
    if (!s || typeof s !== 'object') {
        return '';
    }
    const tid = s.track_id ?? s.id;
    if (tid != null && String(tid).trim() !== '') {
        return String(tid).trim();
    }
    return '';
}

/**
 * Stable identity for residual matching: prefer Spotify track id.
 * @param {{ artist?: string, title?: string, track_id?: string, id?: string }} s
 * @returns {string}
 */
export function historySongKey(s) {
    const id = extractSpotifyTrackId(s);
    if (id) {
        return `spotify:${id}`;
    }
    return `name:${songKey(s)}`;
}

/**
 * @param {Array<{ artist?: string, title?: string, track_id?: string, id?: string }>} previous
 * @param {Array<{ artist?: string, title?: string, track_id?: string, id?: string }>} current
 * @returns {Array<{ artist?: string, title?: string, track_id?: string, id?: string }>}
 */
export function getNewlyPlayedSongs(previous, current) {
    if (!Array.isArray(previous) || !Array.isArray(current)) {
        return Array.isArray(current) ? [...current] : [];
    }

    for (let i = 0; i <= current.length; i++) {
        const newSongs = current.slice(0, i);
        const remainder = current.slice(i);

        const newSongsSet = new Set(newSongs.map((s) => historySongKey(s)));

        const pFiltered = previous.filter((s) => !newSongsSet.has(historySongKey(s)));

        let match = true;
        for (let j = 0; j < remainder.length; j++) {
            if (
                !pFiltered[j] ||
                historySongKey(remainder[j]) !== historySongKey(pFiltered[j])
            ) {
                match = false;
                break;
            }
        }

        if (match) {
            return newSongs;
        }
    }

    return [...current];
}
