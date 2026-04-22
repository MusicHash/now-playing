/**
 * Spotify `album.release_date` shape depends on `release_date_precision` (year | month | day).
 * Normalizes to YYYY-MM-DD for storage.
 *
 * @param {Record<string, unknown> | null | undefined} track
 * @returns {string | null}
 */
export function releaseDateYmdFromSpotifyTrack(track) {
    const album = track?.album;
    if (!album || typeof album !== 'object') {
        return null;
    }
    const raw = typeof album.release_date === 'string' ? album.release_date.trim() : '';
    if (!raw) {
        return null;
    }
    const p =
        typeof album.release_date_precision === 'string' ? album.release_date_precision : '';

    if (p === 'year' && /^\d{4}$/.test(raw)) {
        return `${raw}-01-01`;
    }
    if (p === 'month' && /^\d{4}-\d{2}$/.test(raw)) {
        return `${raw}-01`;
    }
    if (p === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }
    if (/^\d{4}-\d{2}$/.test(raw)) {
        return `${raw}-01`;
    }
    if (/^\d{4}$/.test(raw)) {
        return `${raw}-01-01`;
    }
    return null;
}
