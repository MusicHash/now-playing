/**
 * @param {Record<string, unknown> | null | undefined} track
 * @returns {string | null}
 */
export function isrcFromSpotifyTrack(track) {
    const ext = track?.external_ids;
    const v = ext && typeof ext === 'object' && 'isrc' in ext ? ext.isrc : null;
    if (typeof v !== 'string') {
        return null;
    }
    const t = v.trim();
    return t || null;
}
