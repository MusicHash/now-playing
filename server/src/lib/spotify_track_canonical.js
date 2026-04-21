/**
 * Columns to match for `checkAndInsert` on `nowplaying_spotify_tracks`: prefer ISRC so
 * alternate Spotify catalog IDs for the same recording reuse one row; otherwise fall back
 * to `spotify_track_id`.
 *
 * @param {string} spotifyTrackId
 * @param {string | null | undefined} isrc
 * @returns {{ spotify_isrc: string } | { spotify_track_id: string }}
 */
export function spotifyTrackDuplicateCheckParams(spotifyTrackId, isrc) {
    if (isrc != null && isrc !== '') {
        return { spotify_isrc: isrc };
    }
    return { spotify_track_id: spotifyTrackId };
}

/**
 * Pick one `spotify_id` per ISRC so station (and chart) logs aggregate on the same recording.
 * Rule: highest `spotify_id` (newest row); popularity is not used.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<unknown> }} mysql
 * @param {number} spotifyId
 * @param {string | null | undefined} isrc
 * @returns {Promise<number>}
 */
export async function resolveCanonicalSpotifyId(mysql, spotifyId, isrc) {
    if (isrc == null || isrc === '') {
        return spotifyId;
    }

    const [rows] = await mysql.query(
        'SELECT `spotify_id` FROM `nowplaying_spotify_tracks` WHERE `spotify_isrc` = ? ORDER BY `spotify_id` DESC LIMIT 1',
        [isrc],
    );

    const id = /** @type {{ spotify_id?: number }[]} */ (rows)[0]?.spotify_id;
    return id != null ? Number(id) : spotifyId;
}
